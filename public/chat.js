(function () {
  var SESSION_KEY = "mdt_session_id";

  function getSessionId() {
    var id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "s-" + Date.now() + "-" + Math.random().toString(36).slice(2);
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  }

  function escapeHtml(s) {
    var div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function formatAssistantText(text) {
    if (!text) return "";
    var escaped = escapeHtml(text);
    var lines = escaped.split(/\r\n|\r|\n/);
    var html = [];
    var inUl = false;
    var inOl = false;
    function closeLists() {
      if (inUl) { html.push("</ul>", "<br>"); inUl = false; }
      if (inOl) { html.push("</ol>", "<br>"); inOl = false; }
    }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var ulMatch = /^\s*[-*]\s+(.+)$/.exec(line);
      var olMatch = /^\s*\d+\.\s+(.+)$/.exec(line);
      if (ulMatch) {
        if (inOl) { html.push("</ol>"); inOl = false; }
        if (!inUl) { html.push("<ul>"); inUl = true; }
        html.push("<li>", ulMatch[1], "</li>");
      } else if (olMatch) {
        if (inUl) { html.push("</ul>"); inUl = false; }
        if (!inOl) { html.push("<ol>"); inOl = true; }
        html.push("<li>", olMatch[1], "</li>");
      } else {
        closeLists();
        if (line.length > 0) html.push(line);
        if (i < lines.length - 1) html.push("<br>");
      }
    }
    closeLists();
    var out = html.join("");
    out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
    return out;
  }

  function appendMessage(role, text, isTyping) {
    var messagesEl = document.getElementById("messages");
    var div = document.createElement("div");
    div.className = "message " + role;
    div.setAttribute("data-role", role);
    var bubble = document.createElement("div");
    bubble.className = "bubble" + (isTyping ? " typing" : "");
    if (role === "assistant" && !isTyping && text) {
      bubble.innerHTML = formatAssistantText(text);
    } else {
      bubble.textContent = text || (isTyping ? "..." : "");
    }
    div.appendChild(bubble);
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return bubble;
  }

  function showChipsOnlyWhenEmpty() {
    var messagesEl = document.getElementById("messages");
    var chipsEl = document.getElementById("chips");
    chipsEl.style.display = messagesEl.children.length === 0 ? "flex" : "none";
  }

  function parseStreamBuffer(buffer, onEvent) {
    var parts = buffer.split("\n\n");
    var tail = parts.pop();
    parts.forEach(function (raw) {
      var line = raw.trim();
      if (line.startsWith("data:")) {
        var json = line.slice(5).trim();
        if (json === "[DONE]" || !json) return;
        try {
          var data = JSON.parse(json);
          onEvent(data);
        } catch (e) {}
      }
    });
    return tail;
  }

  function sendMessage(sessionId, message, pageUrl, onConversationId) {
    var messagesEl = document.getElementById("messages");
    appendMessage("user", message, false);
    showChipsOnlyWhenEmpty();

    var aiBubble = appendMessage("assistant", "", true);

    fetch("/api/chat/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: sessionId,
        message: message,
        pageUrl: pageUrl || (typeof window !== "undefined" && window.location ? window.location.href : undefined),
      }),
    })
      .then(function (response) {
        if (!response.ok) {
          return response.text().then(function (text) {
            var msg = "Request failed";
            try {
              var body = JSON.parse(text);
              if (body && body.error) msg = body.error;
            } catch (e) {
              if (text && text.length < 200) msg = text;
              else if (response.status === 500) msg = "Server error. Check that ANTHROPIC_API_KEY is set in .env.";
              else msg = "Error " + response.status;
            }
            throw new Error(msg);
          });
        }
        return response.body.getReader();
      })
      .then(function (reader) {
        var decoder = new TextDecoder();
        var buffer = "";
        var streamedText = "";
        aiBubble.classList.add("typing");
        aiBubble.textContent = "";

        function read() {
          reader.read().then(function (result) {
            if (result.done) {
              aiBubble.classList.remove("typing");
              return;
            }
            buffer += decoder.decode(result.value, { stream: true });
            buffer = parseStreamBuffer(buffer, function (data) {
              if (data.type === "delta" && data.text) {
                streamedText += data.text;
                aiBubble.innerHTML = formatAssistantText(streamedText);
                aiBubble.classList.remove("typing");
                messagesEl.scrollTop = messagesEl.scrollHeight;
              } else if (data.type === "done") {
                aiBubble.classList.remove("typing");
                if (data.conversationId && onConversationId) onConversationId(data.conversationId);
              } else if (data.type === "error") {
                aiBubble.textContent = data.message || "Something went wrong.";
                aiBubble.classList.remove("typing");
              }
            });
            read();
          }).catch(function (err) {
            aiBubble.textContent = err && err.message ? err.message : "Connection error. Please try again.";
            aiBubble.classList.remove("typing");
          });
        }
        read();
      })
      .catch(function (err) {
        aiBubble.textContent = err && err.message ? err.message : "Connection error. Please try again.";
        aiBubble.classList.remove("typing");
      });
  }

  function escalate(conversationId) {
    fetch("/api/chat/escalate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: conversationId }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var msg = data.message || (data.ticketUrl ? "Ticket created. We'll be in touch." : "We'll be in touch.");
        appendMessage("assistant", msg, false);
        document.getElementById("messages").scrollTop = document.getElementById("messages").scrollHeight;
      })
      .catch(function () {
        appendMessage("assistant", "Could not submit. Please try again or email support.", false);
      });
  }

  var suggested = [
    "Where is my order?",
    "Is this compatible with my rifle?",
    "How do I install the chassis?",
  ];

  function loadSuggestedQuestions(callback) {
    fetch("/api/suggested-questions")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.questions && data.questions.length > 0) {
          callback(data.questions);
        } else {
          callback(suggested);
        }
      })
      .catch(function () { callback(suggested); });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("chat-form");
    var input = document.getElementById("chat-input");
    var chipsEl = document.getElementById("chips");
    var sessionId = getSessionId();
    var currentConversationId = null;

    // If embedded on Shopify/Zendesk with known user, identify immediately
    var pageUser = typeof window !== "undefined" && window.MDT_CHAT_USER;
    if (pageUser && pageUser.email && typeof pageUser.email === "string" && pageUser.email.trim()) {
      fetch("/api/chat/session?sessionId=" + encodeURIComponent(sessionId))
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.conversationId) {
            var payload = { conversationId: data.conversationId, email: pageUser.email.trim() };
            if (pageUser.name && typeof pageUser.name === "string" && pageUser.name.trim()) {
              payload.name = pageUser.name.trim();
            }
            fetch("/api/chat/identify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            }).catch(function () {});
          }
        })
        .catch(function () {});
    }

    function renderChips(questions) {
      chipsEl.innerHTML = "";
      (questions || suggested).forEach(function (label) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.addEventListener("click", function () {
        input.value = label;
        var text = (input.value || "").trim();
        if (text) {
          input.value = "";
          sendMessage(sessionId, text, window.location.href, function (id) {
            currentConversationId = id;
          });
        }
      });
      chipsEl.appendChild(btn);
    });
    }

    loadSuggestedQuestions(function (questions) {
      renderChips(questions);
      showChipsOnlyWhenEmpty();
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var text = (input.value || "").trim();
      if (!text) return;
      input.value = "";
      sendMessage(sessionId, text, window.location.href, function (id) {
        currentConversationId = id;
      });
    });

    document.getElementById("talk-to-human").addEventListener("click", function (e) {
      e.preventDefault();
      if (currentConversationId) {
        escalate(currentConversationId);
        return;
      }
      fetch("/api/chat/session?sessionId=" + encodeURIComponent(sessionId))
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.conversationId) {
            escalate(data.conversationId);
          } else {
            appendMessage("assistant", "Could not start escalation. Send a message first.", false);
          }
        })
        .catch(function () {
          appendMessage("assistant", "Could not submit. Please try again.", false);
        });
    });
  });
})();
