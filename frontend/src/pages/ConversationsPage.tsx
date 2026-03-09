import { useState, useEffect } from "react";
import { api, type ConversationListItem, type ConversationDetail } from "../lib/api";
import { X } from "lucide-react";

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "BOT", label: "Bot" },
  { value: "ESCALATED", label: "Escalated" },
  { value: "RESOLVED", label: "Resolved" },
];

function OutcomeBadge({ status }: { status: string }) {
  if (status === "RESOLVED") return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400">Resolved</span>;
  if (status === "ESCALATED") return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400">Escalated</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-500/20 text-gray-400">Bot</span>;
}

function formatDate(s: string) {
  try {
    const d = new Date(s);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return s;
  }
}

export function ConversationsPage() {
  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [status, setStatus] = useState("");
  const [topic, setTopic] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ConversationDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getConversations({ page, limit, status: status || undefined, topic: topic || undefined, search: search || undefined });
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [page, limit, status, topic, search]);

  const openDetail = async (id: string) => {
    setLoadingDetail(true);
    setSelected(null);
    try {
      const c = await api.getConversation(id);
      setSelected(c);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDetail(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-white">Conversations</h1>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Search by email or name..."
          className="rounded-lg border border-border-dark bg-panel px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-accent focus:outline-none"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setSearch(searchInput)}
        />
        <button
          type="button"
          onClick={() => setSearch(searchInput)}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark"
        >
          Search
        </button>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-border-dark bg-panel px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value || "all"} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Filter by topic..."
          className="rounded-lg border border-border-dark bg-panel px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-accent focus:outline-none w-48"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
      </div>

      <div className="rounded-lg border border-border-dark bg-panel overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No conversations found.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-dark text-left text-xs text-gray-400 uppercase tracking-wider">
                <th className="p-3 font-medium">Customer</th>
                <th className="p-3 font-medium">Topic</th>
                <th className="p-3 font-medium">Messages</th>
                <th className="p-3 font-medium">Sentiment</th>
                <th className="p-3 font-medium">Outcome</th>
                <th className="p-3 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => openDetail(c.id)}
                  className="border-b border-border-dark hover:bg-white/5 cursor-pointer transition-colors"
                >
                  <td className="p-3">
                    <div className="text-white font-medium">{c.customerName || "—"}</div>
                    <div className="text-sm text-gray-400">{c.customerEmail || "—"}</div>
                  </td>
                  <td className="p-3 text-gray-300">{c.topic || "—"}</td>
                  <td className="p-3 text-gray-300">{c.messageCount}</td>
                  <td className="p-3 text-gray-300">{c.sentiment || "—"}</td>
                  <td className="p-3"><OutcomeBadge status={c.status} /></td>
                  <td className="p-3 text-sm text-gray-400">{formatDate(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {total > limit && (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span>Page {page} of {Math.ceil(total / limit)}</span>
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="text-accent hover:underline disabled:opacity-50 disabled:no-underline"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={page >= Math.ceil(total / limit)}
            onClick={() => setPage((p) => p + 1)}
            className="text-accent hover:underline disabled:opacity-50 disabled:no-underline"
          >
            Next
          </button>
        </div>
      )}

      {/* Drawer */}
      {selected !== null && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelected(null)} aria-hidden />
          <div className="relative w-full max-w-lg bg-panel border-l border-border-dark flex flex-col shadow-xl">
            <div className="flex items-center justify-between p-4 border-b border-border-dark">
              <h2 className="text-lg font-semibold text-white">Conversation</h2>
              <button type="button" onClick={() => setSelected(null)} className="p-1 text-gray-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {selected.customer && (
                <p className="text-sm text-gray-400">
                  {selected.customer.name || selected.customer.email}
                  {selected.customer.email && selected.customer.name && ` (${selected.customer.email})`}
                </p>
              )}
              {selected.messages.map((m) => (
                <div key={m.id} className={m.role === "USER" ? "text-right" : "text-left"}>
                  <span className="text-xs text-gray-500">
                    {m.role === "ASSISTANT" ? "MDT AI" : selected.customer?.email || "User"}
                  </span>
                  <div
                    className={`mt-1 rounded-lg px-3 py-2 text-sm ${
                      m.role === "USER"
                        ? "bg-accent/20 text-white inline-block"
                        : "bg-white/5 text-gray-300"
                    }`}
                  >
                    <span className="whitespace-pre-wrap">{m.content}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-border-dark flex gap-2">
              <OutcomeBadge status={selected.status} />
              {selected.topic && <span className="text-xs text-gray-400">Topic: {selected.topic}</span>}
              {selected.sentiment && <span className="text-xs text-gray-400">Sentiment: {selected.sentiment}</span>}
            </div>
          </div>
        </div>
      )}

      {loadingDetail && selected === null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="text-white">Loading...</div>
        </div>
      )}
    </div>
  );
}
