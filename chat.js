(function() {
  var messagesEl = document.getElementById('messages');
  var inputEl = document.getElementById('input');
  var sendBtn = document.getElementById('send');
  if (!messagesEl || !inputEl || !sendBtn) return;

  var conversationId = null;
  var loading = false;

  function addMsg(role, content) {
    var div = document.createElement('div');
    div.className = 'msg ' + role;
    div.textContent = content;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  function showEmpty() {
    if (messagesEl.querySelectorAll('.msg').length === 0) {
      var p = document.createElement('p');
      p.style.cssText = 'text-align:center;color:#64748b;padding:24px;margin:0;';
      p.textContent = 'Type a message below to get started.';
      messagesEl.appendChild(p);
    }
  }

  function hideEmpty() {
    var p = messagesEl.querySelector('p');
    if (p && !p.classList.contains('msg')) p.remove();
  }

  showEmpty();

  function send() {
    var text = (inputEl.value || '').trim();
    if (!text || loading) return;

    hideEmpty();
    inputEl.value = '';
    addMsg('user', text);
    var assistantEl = addMsg('assistant', '');
    loading = true;
    sendBtn.disabled = true;

    var apiUrl = window.API_BASE_URL || (window.location.origin || '');
    var url = apiUrl + '/api/chat/stream';

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: conversationId,
        message: text,
        customerEmail: null
      })
    })
      .then(function(res) {
        if (!res.ok || !res.body) {
          assistantEl.textContent = 'Something went wrong. Please try again.';
          return;
        }
        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var full = '';
        var buffer = '';
        function pump() {
          return reader.read().then(function(_ref) {
            var done = _ref.done, value = _ref.value;
            if (done) return;
            buffer += decoder.decode(value, { stream: true });
            var events = buffer.split('\n\n');
            buffer = events.pop() || '';
            for (var i = 0; i < events.length; i++) {
              var event = events[i];
              var lines = event.split('\n');
              for (var j = 0; j < lines.length; j++) {
                if (lines[j].indexOf('data: ') === 0) {
                  try {
                    var data = JSON.parse(lines[j].slice(6));
                    if (data.type === 'text' && data.content != null) {
                      full += data.content;
                      assistantEl.textContent = full;
                      messagesEl.scrollTop = messagesEl.scrollHeight;
                    } else if (data.type === 'done' && data.conversationId) {
                      conversationId = data.conversationId;
                    }
                  } catch (_) {}
                  break;
                }
              }
            }
            return pump();
          });
        }
        return pump();
      })
      .catch(function() {
        assistantEl.textContent = 'Something went wrong. Please try again.';
      })
      .finally(function() {
        loading = false;
        sendBtn.disabled = false;
      });
  }

  var form = document.getElementById('chat-form');
  function handleSubmit(e) {
    e.preventDefault();
    send();
  }
  if (form) form.addEventListener('submit', handleSubmit);
  sendBtn.addEventListener('click', handleSubmit);
})();
