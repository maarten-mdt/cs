import { useEffect, useRef, useState, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useHubStore } from "../../stores/hubStore";
import { hubApi, type MessageItem } from "../../lib/hubApi";
import { useHotkeys } from "react-hotkeys-hook";
import {
  Send,
  Lock,
  Phone,
  CheckCircle,
  ArrowUp,
  ArrowDown,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { LogCallModal } from "./LogCallModal";
import { CannedResponseModal } from "./CannedResponseModal";

interface Props {
  ticketId: string;
}

const roleColors: Record<string, string> = {
  USER: "bg-surface",
  ASSISTANT: "bg-blue-900/30",
  AGENT: "bg-green-900/30",
  SYSTEM: "bg-yellow-900/20",
};

const roleLabels: Record<string, string> = {
  USER: "Customer",
  ASSISTANT: "AI Bot",
  AGENT: "Agent",
  SYSTEM: "System",
};

export function ConversationThread({ ticketId }: Props) {
  const ticketCache = useHubStore((s) => s.ticketCache);
  const cacheTicketDetail = useHubStore((s) => s.cacheTicketDetail);
  const addMessage = useHubStore((s) => s.addMessage);
  const patchTicket = useHubStore((s) => s.patchTicket);
  const tickets = useHubStore((s) => s.tickets);
  const composerTab = useHubStore((s) => s.composerTab);
  const setComposerTab = useHubStore((s) => s.setComposerTab);
  const composerDraft = useHubStore((s) => s.composerDraft);
  const setComposerDraft = useHubStore((s) => s.setComposerDraft);

  const detail = ticketCache.get(ticketId);
  const ticket = tickets.get(ticketId);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [showCallModal, setShowCallModal] = useState(false);
  const [showCannedModal, setShowCannedModal] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const draft = composerDraft.get(ticketId) || "";

  // Fetch detail if not cached
  useEffect(() => {
    if (!detail && !loading) {
      setLoading(true);
      hubApi.getConversation(ticketId).then((d) => {
        cacheTicketDetail(ticketId, d);
      }).catch((e) => console.error(e))
        .finally(() => setLoading(false));
    }
  }, [ticketId, detail, loading, cacheTicketDetail]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [detail?.messages.length]);

  // Keyboard shortcuts
  useHotkeys("r", () => {
    setComposerTab("reply");
    textareaRef.current?.focus();
  }, { enabled: !!detail, preventDefault: true });

  useHotkeys("n", () => {
    setComposerTab("note");
    textareaRef.current?.focus();
  }, { enabled: !!detail, preventDefault: true });

  useHotkeys("ctrl+k, meta+k", () => {
    setShowCannedModal(true);
  }, { enabled: !!detail, preventDefault: true });

  useHotkeys("e", () => {
    if (draft.trim()) handleSend(true);
  }, { enabled: !!detail && !!draft.trim(), preventDefault: true });

  const handleSend = useCallback(async (resolve = false) => {
    if (!draft.trim() || sending) return;
    const isInternal = composerTab === "note";

    // Optimistic: add message immediately
    const tempMsg: MessageItem = {
      id: `temp-${Date.now()}`,
      role: isInternal ? "SYSTEM" : "AGENT",
      content: draft.trim(),
      channel: null,
      senderAgentId: null,
      isInternal,
      feedback: null,
      createdAt: new Date().toISOString(),
    };
    addMessage(ticketId, tempMsg);
    setComposerDraft(ticketId, "");
    setSending(true);

    try {
      const realMsg = await hubApi.sendReply(ticketId, draft.trim(), isInternal);
      // Replace temp message with real one in cache
      const cached = useHubStore.getState().ticketCache.get(ticketId);
      if (cached) {
        const messages = cached.messages.map((m) => m.id === tempMsg.id ? realMsg : m);
        cacheTicketDetail(ticketId, { ...cached, messages });
      }

      if (resolve) {
        await hubApi.updateConversation(ticketId, { status: "RESOLVED" });
        patchTicket(ticketId, { status: "RESOLVED" });
      }
    } catch (e) {
      console.error("Failed to send:", e);
      // TODO: mark message as failed, show retry
    } finally {
      setSending(false);
    }
  }, [draft, sending, composerTab, ticketId, addMessage, setComposerDraft, cacheTicketDetail, patchTicket]);

  const insertCannedResponse = useCallback((content: string) => {
    setComposerDraft(ticketId, draft + content);
    setShowCannedModal(false);
    textareaRef.current?.focus();
  }, [ticketId, draft, setComposerDraft]);

  if (loading || !detail) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 animate-pulse">
        Loading conversation...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border-dark flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-white">
            {detail.subject || detail.customer?.name || detail.customer?.email || detail.sessionId.slice(0, 12)}
          </h2>
          <p className="text-xs text-gray-500">
            {detail.channel} · {detail.storeRegion} · #{detail.sessionId.slice(0, 8)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={detail.status} />
          <PriorityBadge priority={detail.priority} />
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {detail.messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
      </div>

      {/* Composer */}
      <div className="border-t border-border-dark">
        {/* Tabs */}
        <div className="flex items-center gap-1 px-3 pt-2">
          <button
            onClick={() => setComposerTab("reply")}
            className={`px-3 py-1 text-xs rounded-t-md ${
              composerTab === "reply"
                ? "bg-accent/20 text-accent"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <Send className="inline h-3 w-3 mr-1" />
            Reply
          </button>
          <button
            onClick={() => setComposerTab("note")}
            className={`px-3 py-1 text-xs rounded-t-md ${
              composerTab === "note"
                ? "bg-yellow-500/20 text-yellow-400"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <Lock className="inline h-3 w-3 mr-1" />
            Internal Note
          </button>
          <button
            onClick={() => setShowCallModal(true)}
            className="px-3 py-1 text-xs text-gray-400 hover:text-white"
          >
            <Phone className="inline h-3 w-3 mr-1" />
            Log Call
          </button>
        </div>

        {/* Input */}
        <div className="px-3 pb-3 pt-1">
          <div className={`rounded-lg border ${composerTab === "note" ? "border-yellow-500/30 bg-yellow-900/10" : "border-border-dark bg-surface"}`}>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setComposerDraft(ticketId, e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={composerTab === "note" ? "Internal note (not visible to customer)..." : "Type your reply..."}
              className="w-full bg-transparent px-3 py-2 text-sm text-white placeholder-gray-500 resize-none focus:outline-none min-h-[60px] max-h-[200px]"
              rows={3}
            />
            <div className="flex items-center justify-between px-3 pb-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowCannedModal(true)}
                  className="text-xs text-gray-500 hover:text-white"
                  title="Canned responses (Ctrl+K)"
                >
                  /canned
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleSend(true)}
                  disabled={!draft.trim() || sending}
                  className="text-xs text-gray-400 hover:text-white disabled:opacity-30"
                  title="Send & Resolve (E)"
                >
                  <CheckCircle className="inline h-3.5 w-3.5 mr-1" />
                  Send & Resolve
                </button>
                <button
                  onClick={() => handleSend()}
                  disabled={!draft.trim() || sending}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white text-xs rounded-md hover:bg-accent/80 disabled:opacity-30"
                >
                  <Send className="h-3.5 w-3.5" />
                  {sending ? "Sending..." : "Send"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showCallModal && (
        <LogCallModal
          ticketId={ticketId}
          customerPhone={detail.customer?.phone || undefined}
          onClose={() => setShowCallModal(false)}
        />
      )}
      {showCannedModal && (
        <CannedResponseModal
          onSelect={insertCannedResponse}
          onClose={() => setShowCannedModal(false)}
        />
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: MessageItem }) {
  const isUser = message.role === "USER";
  const isSystem = message.role === "SYSTEM";
  const isInternal = message.isInternal;

  return (
    <div className={`flex ${isUser ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[75%] rounded-lg px-3 py-2 ${
          isInternal
            ? "bg-yellow-900/20 border border-yellow-500/20"
            : isSystem
            ? "bg-gray-800/50 border border-gray-700 w-full max-w-full"
            : roleColors[message.role] || "bg-surface"
        }`}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-medium text-gray-400">
            {isInternal ? "Internal Note" : roleLabels[message.role] || message.role}
          </span>
          <span className="text-[10px] text-gray-600">
            {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <div className="text-sm text-white whitespace-pre-wrap break-words">
          {message.content}
        </div>
        {message.feedback && (
          <div className="mt-1 flex items-center gap-1">
            {message.feedback.rating === "up" ? (
              <ThumbsUp className="h-3 w-3 text-green-400" />
            ) : (
              <ThumbsDown className="h-3 w-3 text-red-400" />
            )}
            {message.feedback.comment && (
              <span className="text-[10px] text-gray-500">{message.feedback.comment}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    BOT: "bg-blue-500/20 text-blue-400",
    OPEN: "bg-green-500/20 text-green-400",
    PENDING: "bg-yellow-500/20 text-yellow-400",
    ESCALATED: "bg-red-500/20 text-red-400",
    SNOOZED: "bg-purple-500/20 text-purple-400",
    RESOLVED: "bg-gray-500/20 text-gray-400",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded ${colors[status] || "bg-gray-500/20 text-gray-400"}`}>
      {status}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  if (priority === "NORMAL" || priority === "LOW") return null;
  const colors: Record<string, string> = {
    URGENT: "bg-red-500/20 text-red-400",
    HIGH: "bg-orange-500/20 text-orange-400",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded ${colors[priority] || ""}`}>
      {priority}
    </span>
  );
}
