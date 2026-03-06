import React, { useState, useRef, useEffect } from "react";

interface MDTWidgetConfig {
  apiUrl: string;
  greeting?: string;
  suggestedQuestions?: string[];
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export function ChatWidget({ config }: { config: MDTWidgetConfig }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const greeting = config.greeting || "Hi! How can I help you today?";
  const suggested = config.suggestedQuestions || [
    "Where is my order?",
    "Product compatibility",
    "Return policy",
  ];

  const [escalating, setEscalating] = useState(false);

  useEffect(() => {
    if (open) {
      if (messages.length === 0) {
        setMessages([{ id: "0", role: "assistant", content: greeting }]);
      }
      inputRef.current?.focus();
    }
  }, [open, greeting, messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || loading) return;

    setInput("");
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", content: text }]);
    setLoading(true);

    const assistantId = crypto.randomUUID();
    setMessages((m) => [...m, { id: assistantId, role: "assistant", content: "" }]);

    try {
      const res = await fetch(`${config.apiUrl}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          message: text,
          customerEmail: null,
        }),
      });

      if (!res.ok || !res.body) throw new Error("Stream failed");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "text") {
                fullContent += data.content;
                setMessages((m) =>
                  m.map((msg) =>
                    msg.id === assistantId ? { ...msg, content: fullContent } : msg
                  )
                );
              } else if (data.type === "done" && data.conversationId) {
                setConversationId(data.conversationId);
              }
            } catch (_) {}
          }
        }
      }
    } catch (err) {
      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantId
            ? { ...msg, content: "Sorry, something went wrong. Please try again." }
            : msg
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const escalateToHuman = async () => {
    const email = prompt("Please enter your email so we can follow up:");
    if (!email?.trim()) return;
    setEscalating(true);
    try {
      const res = await fetch(`${config.apiUrl}/api/zendesk/escalate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: "Chat escalation",
          description: `Conversation summary:\n${messages.map((m) => `${m.role}: ${m.content}`).join("\n")}`,
          requesterEmail: email.trim(),
        }),
      });
      const data = await res.json();
      if (data.ticketId) {
        setMessages((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `A support ticket (#${data.ticketId}) has been created. Our team will reach out to you at ${email} shortly.`,
          },
        ]);
      } else {
        setMessages((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "Sorry, we couldn't create the ticket. Please email support directly.",
          },
        ]);
      }
    } catch {
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Something went wrong. Please email support directly.",
        },
      ]);
    } finally {
      setEscalating(false);
    }
  };

  return (
    <>
      <style>{`
        #mdt-chat-root {
          font-family: 'Poppins', -apple-system, BlinkMacSystemFont, sans-serif;
          position: fixed;
          bottom: 0;
          right: 0;
          z-index: 999999;
        }
        .mdt-chat-button {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: #1a1a1a;
          border: none;
          color: white;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          margin: 0 20px 20px 0;
          font-size: 24px;
        }
        .mdt-chat-button:hover { background: #2d2d2d; }
        .mdt-chat-panel {
          position: absolute;
          bottom: 90px;
          right: 20px;
          width: 380px;
          max-width: calc(100vw - 40px);
          height: 500px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.2);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .mdt-chat-header {
          background: #1a1a1a;
          color: white;
          padding: 16px;
          font-weight: 600;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .mdt-chat-escalate {
          font-size: 12px;
          padding: 6px 12px;
          background: #22c55e;
          border: none;
          color: white;
          border-radius: 6px;
          cursor: pointer;
        }
        .mdt-chat-escalate:hover:not(:disabled) { background: #16a34a; }
        .mdt-chat-escalate:disabled { opacity: 0.6; cursor: not-allowed; }
        .mdt-chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .mdt-chat-msg { max-width: 85%; padding: 10px 14px; border-radius: 12px; }
        .mdt-chat-msg.user { align-self: flex-end; background: #22c55e; color: white; }
        .mdt-chat-msg.assistant { align-self: flex-start; background: #f1f5f9; }
        .mdt-chat-suggested { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
        .mdt-chat-suggested button {
          padding: 8px 12px;
          border: 1px solid #22c55e;
          background: white;
          color: #22c55e;
          border-radius: 8px;
          cursor: pointer;
          font-size: 13px;
        }
        .mdt-chat-suggested button:hover { background: #22c55e; color: white; }
        .mdt-chat-input-row {
          padding: 12px;
          border-top: 1px solid #e2e8f0;
          display: flex;
          gap: 8px;
        }
        .mdt-chat-input-row input {
          flex: 1;
          padding: 12px 16px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          font-size: 14px;
        }
        .mdt-chat-input-row input:focus {
          outline: none;
          border-color: #22c55e;
        }
        .mdt-chat-input-row button {
          padding: 12px 20px;
          background: #22c55e;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
        }
        .mdt-chat-input-row button:hover { background: #16a34a; }
        .mdt-chat-input-row button:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>

      <button
        className="mdt-chat-button"
        onClick={() => setOpen(!open)}
        aria-label="Open chat"
      >
        {open ? "×" : "💬"}
      </button>

      {open && (
        <div className="mdt-chat-panel">
          <div className="mdt-chat-header">
            MDT Support
            <button
              className="mdt-chat-escalate"
              onClick={escalateToHuman}
              disabled={escalating}
            >
              Talk to a human
            </button>
          </div>
          <div className="mdt-chat-messages">
            {messages.map((msg) => (
              <div key={msg.id} className={`mdt-chat-msg ${msg.role}`}>
                {msg.content || (loading ? "..." : "")}
              </div>
            ))}
            {messages.length === 1 && (
              <div className="mdt-chat-suggested">
                {suggested.map((q) => (
                  <button key={q} onClick={() => sendMessage(q)}>
                    {q}
                  </button>
                ))}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="mdt-chat-input-row">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Type a message..."
            />
            <button onClick={sendMessage} disabled={loading}>
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
}
