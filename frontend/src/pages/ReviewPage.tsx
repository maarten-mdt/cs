import { useState, useEffect, useCallback } from "react";

const apiBase = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "") + "/api/admin";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error || "Request failed");
  }
  return res.json();
}

interface FeedbackItem {
  id: string;
  rating: string;
  comment: string | null;
  createdAt: string;
  messageId: string;
  botResponse: string;
  userQuestion: string | null;
  conversationId: string;
  customer: { id: string; email: string; name: string | null } | null;
}

interface DiscrepancyItem {
  id: string;
  communitySource: string;
  communityText: string;
  websiteText: string | null;
  websiteUrl: string | null;
  topic: string;
  aiSuggestion: string | null;
  status: string;
  createdAt: string;
}

interface QAItem {
  id: string;
  question: string;
  answer: string;
  source: string | null;
  addedBy: string | null;
  active: boolean;
  createdAt: string;
}

interface ReviewStats {
  thumbsDown: number;
  thumbsUp: number;
  openDiscrepancies: number;
  totalQA: number;
}

type Tab = "feedback" | "discrepancies" | "qa";

export function ReviewPage() {
  const [tab, setTab] = useState<Tab>("feedback");
  const [stats, setStats] = useState<ReviewStats | null>(null);

  useEffect(() => {
    request<ReviewStats>("/review/stats").then(setStats).catch(console.error);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Daily Review</h1>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="Thumbs Down" value={stats.thumbsDown} color="text-red-400" />
          <StatCard label="Thumbs Up" value={stats.thumbsUp} color="text-green-400" />
          <StatCard label="Open Discrepancies" value={stats.openDiscrepancies} color="text-yellow-400" />
          <StatCard label="Curated Q&A" value={stats.totalQA} color="text-blue-400" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/10 pb-0">
        {(["feedback", "discrepancies", "qa"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-accent text-white"
                : "border-transparent text-gray-400 hover:text-white"
            }`}
          >
            {t === "feedback" ? "Feedback" : t === "discrepancies" ? "Discrepancies" : "Q&A Library"}
          </button>
        ))}
      </div>

      {tab === "feedback" && <FeedbackTab onUpdate={() => request<ReviewStats>("/review/stats").then(setStats)} />}
      {tab === "discrepancies" && <DiscrepancyTab onUpdate={() => request<ReviewStats>("/review/stats").then(setStats)} />}
      {tab === "qa" && <QATab onUpdate={() => request<ReviewStats>("/review/stats").then(setStats)} />}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg bg-white/5 p-4">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
    </div>
  );
}

/* ── Feedback Tab ──────────────────────────────────────────────── */

function FeedbackTab({ onUpdate }: { onUpdate: () => void }) {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [correctedAnswer, setCorrectedAnswer] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    request<{ items: FeedbackItem[] }>("/review/feedback?rating=down&limit=50")
      .then((d) => setItems(d.items))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const submitCorrection = async (item: FeedbackItem) => {
    if (!correctedAnswer.trim()) return;
    try {
      await request("/review/correct", {
        method: "POST",
        body: JSON.stringify({
          messageId: item.messageId,
          question: item.userQuestion || "Customer question",
          correctedAnswer: correctedAnswer.trim(),
        }),
      });
      setCorrecting(null);
      setCorrectedAnswer("");
      onUpdate();
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  if (loading) return <div className="text-gray-400">Loading feedback...</div>;
  if (items.length === 0) return <div className="text-gray-400">No thumbs-down feedback yet.</div>;

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.id} className="rounded-lg bg-white/5 p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div className="text-xs text-gray-500">
              {item.customer?.email || "Anonymous"} &middot; {new Date(item.createdAt).toLocaleDateString()}
              {item.comment && <span className="ml-2 text-yellow-400">"{item.comment}"</span>}
            </div>
            <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded">thumbs down</span>
          </div>

          {item.userQuestion && (
            <div>
              <div className="text-xs text-gray-500 mb-1">Customer asked:</div>
              <div className="text-sm text-gray-300 bg-white/5 rounded p-2">{item.userQuestion}</div>
            </div>
          )}

          <div>
            <div className="text-xs text-gray-500 mb-1">Bot responded:</div>
            <div className="text-sm text-gray-300 bg-white/5 rounded p-2 max-h-40 overflow-y-auto">
              {item.botResponse}
            </div>
          </div>

          {correcting === item.id ? (
            <div className="space-y-2">
              <textarea
                className="w-full rounded bg-white/10 border border-white/20 p-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-accent"
                rows={4}
                placeholder="Write the correct answer..."
                value={correctedAnswer}
                onChange={(e) => setCorrectedAnswer(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => submitCorrection(item)}
                  className="rounded bg-accent px-3 py-1.5 text-sm text-white hover:bg-accent/80"
                >
                  Save Correction
                </button>
                <button
                  onClick={() => { setCorrecting(null); setCorrectedAnswer(""); }}
                  className="rounded bg-white/10 px-3 py-1.5 text-sm text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setCorrecting(item.id); setCorrectedAnswer(""); }}
              className="rounded bg-white/10 px-3 py-1.5 text-sm text-gray-400 hover:text-white"
            >
              Correct this response
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Discrepancy Tab ───────────────────────────────────────────── */

function DiscrepancyTab({ onUpdate }: { onUpdate: () => void }) {
  const [items, setItems] = useState<DiscrepancyItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    request<{ items: DiscrepancyItem[] }>("/review/discrepancies?status=open&limit=50")
      .then((d) => setItems(d.items))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const resolve = async (id: string, status: "resolved" | "dismissed") => {
    try {
      await request(`/review/discrepancies/${id}`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      onUpdate();
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  if (loading) return <div className="text-gray-400">Loading discrepancies...</div>;
  if (items.length === 0) return <div className="text-gray-400">No open discrepancies.</div>;

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.id} className="rounded-lg bg-white/5 p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div className="text-sm font-medium text-white">{item.topic}</div>
            <div className="text-xs text-gray-500">{new Date(item.createdAt).toLocaleDateString()}</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-gray-500 mb-1">Community ({item.communitySource}):</div>
              <div className="text-sm text-gray-300 bg-white/5 rounded p-2 max-h-32 overflow-y-auto">
                {item.communityText.slice(0, 500)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">
                Website{item.websiteUrl ? ` (${item.websiteUrl})` : ""}:
              </div>
              <div className="text-sm text-gray-300 bg-white/5 rounded p-2 max-h-32 overflow-y-auto">
                {item.websiteText?.slice(0, 500) || "No matching content"}
              </div>
            </div>
          </div>

          {item.aiSuggestion && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded p-2">
              <div className="text-xs text-yellow-400 mb-1">AI Suggestion:</div>
              <div className="text-sm text-gray-300">{item.aiSuggestion}</div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => resolve(item.id, "resolved")}
              className="rounded bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-500"
            >
              Resolve
            </button>
            <button
              onClick={() => resolve(item.id, "dismissed")}
              className="rounded bg-white/10 px-3 py-1.5 text-sm text-gray-400 hover:text-white"
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Q&A Tab ───────────────────────────────────────────────────── */

function QATab({ onUpdate }: { onUpdate: () => void }) {
  const [items, setItems] = useState<QAItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newQ, setNewQ] = useState("");
  const [newA, setNewA] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    request<{ items: QAItem[] }>("/review/qa?limit=100")
      .then((d) => setItems(d.items))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const addQA = async () => {
    if (!newQ.trim() || !newA.trim()) return;
    try {
      await request("/review/qa", {
        method: "POST",
        body: JSON.stringify({ question: newQ.trim(), answer: newA.trim() }),
      });
      setNewQ("");
      setNewA("");
      setShowAdd(false);
      onUpdate();
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const deleteQA = async (id: string) => {
    if (!confirm("Delete this Q&A pair?")) return;
    try {
      await request(`/review/qa/${id}`, { method: "DELETE" });
      onUpdate();
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  if (loading) return <div className="text-gray-400">Loading Q&A library...</div>;

  return (
    <div className="space-y-4">
      <button
        onClick={() => setShowAdd(!showAdd)}
        className="rounded bg-accent px-4 py-2 text-sm text-white hover:bg-accent/80"
      >
        + Add Q&A Pair
      </button>

      {showAdd && (
        <div className="rounded-lg bg-white/5 p-4 space-y-3">
          <input
            className="w-full rounded bg-white/10 border border-white/20 p-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-accent"
            placeholder="Question..."
            value={newQ}
            onChange={(e) => setNewQ(e.target.value)}
          />
          <textarea
            className="w-full rounded bg-white/10 border border-white/20 p-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-accent"
            rows={3}
            placeholder="Answer..."
            value={newA}
            onChange={(e) => setNewA(e.target.value)}
          />
          <div className="flex gap-2">
            <button onClick={addQA} className="rounded bg-accent px-3 py-1.5 text-sm text-white hover:bg-accent/80">
              Save
            </button>
            <button onClick={() => setShowAdd(false)} className="rounded bg-white/10 px-3 py-1.5 text-sm text-gray-400 hover:text-white">
              Cancel
            </button>
          </div>
        </div>
      )}

      {items.length === 0 && !showAdd && (
        <div className="text-gray-400">No curated Q&A pairs yet. Add one to improve bot answers.</div>
      )}

      {items.map((item) => (
        <div key={item.id} className="rounded-lg bg-white/5 p-4 space-y-2">
          <div className="flex items-start justify-between">
            <div className="text-sm font-medium text-white">Q: {item.question}</div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{item.source} &middot; {item.addedBy || "system"}</span>
              <button onClick={() => deleteQA(item.id)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
            </div>
          </div>
          <div className="text-sm text-gray-300">A: {item.answer}</div>
        </div>
      ))}
    </div>
  );
}
