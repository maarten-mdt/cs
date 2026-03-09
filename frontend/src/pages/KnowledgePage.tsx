import { useState, useEffect } from "react";
import { api, type SourceListItem, type SourceDetail } from "../lib/api";
import { Plus, RefreshCw, Trash2, X, BookOpen } from "lucide-react";

const SOURCE_TYPES = [
  { value: "WEBSITE", label: "Website" },
  { value: "ZENDESK", label: "Zendesk Help Center" },
  { value: "GOOGLE_DRIVE", label: "Google Drive" },
  { value: "GOOGLE_SHEETS", label: "Google Sheets" },
  { value: "SHOPIFY", label: "Shopify Products" },
];

function StatusDot({ status }: { status: string }) {
  if (status === "SYNCED") return <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" title="Synced" />;
  if (status === "FAILED") return <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" title="Failed" />;
  return <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500 animate-pulse" title="Pending/Syncing" />;
}

function formatDate(s: string | null) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return s;
  }
}

export function KnowledgePage() {
  const [sources, setSources] = useState<SourceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState("WEBSITE");
  const [addName, setAddName] = useState("");
  const [addUrl, setAddUrl] = useState("");
  const [addMaxPages, setAddMaxPages] = useState(500);
  const [submitting, setSubmitting] = useState(false);
  const [chunksDrawer, setChunksDrawer] = useState<SourceDetail | null>(null);
  const [editSource, setEditSource] = useState<SourceListItem | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [systemPromptSaved, setSystemPromptSaved] = useState<string | null>(null);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>(["", "", ""]);
  const [questionsSaved, setQuestionsSaved] = useState(false);

  const loadSources = async () => {
    setLoading(true);
    try {
      const list = await api.getSources();
      setSources(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadSystemPrompt = async () => {
    try {
      const res = await api.getSystemPrompt();
      setSystemPrompt(res.systemPrompt);
    } catch (e) {
      console.error(e);
    }
  };

  const loadSuggestedQuestions = async () => {
    try {
      const res = await api.getSuggestedQuestions();
      setSuggestedQuestions(res.questions.length >= 3 ? res.questions.slice(0, 3) : [...res.questions, "", "", ""].slice(0, 3));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadSources();
    loadSystemPrompt();
    loadSuggestedQuestions();
  }, []);

  const handleAddSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName.trim()) return;
    setSubmitting(true);
    try {
      const body: { name: string; type: string; url?: string; maxPages?: number } = {
        name: addName.trim(),
        type: addType,
      };
      if (addType === "WEBSITE" && addUrl.trim()) body.url = addUrl.trim();
      if (addType === "WEBSITE") body.maxPages = Math.min(50000, Math.max(1, addMaxPages));
      if (addType === "GOOGLE_DRIVE" && addUrl.trim()) body.url = addUrl.trim();
      await api.createSource(body);
      setAddOpen(false);
      setAddName("");
      setAddUrl("");
      setAddMaxPages(500);
      loadSources();
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateSource = async (id: string, data: { name?: string; maxPages?: number; url?: string | null }) => {
    try {
      await api.updateSource(id, data);
      setEditSource(null);
      loadSources();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveSystemPrompt = async () => {
    try {
      await api.putSystemPrompt(systemPrompt);
      setSystemPromptSaved(new Date().toISOString());
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveSuggestedQuestions = async () => {
    try {
      const qs = suggestedQuestions.map((q) => q.trim()).filter(Boolean);
      await api.putSuggestedQuestions(qs.length ? qs : ["Where is my order?", "Is this compatible with my rifle?", "How do I install the chassis?"]);
      setQuestionsSaved(true);
      setTimeout(() => setQuestionsSaved(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold text-white">Knowledge Base</h1>

      {/* Data sources */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Data Sources</h2>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark"
          >
            <Plus className="h-4 w-4" /> Add Source
          </button>
        </div>
        <div className="rounded-lg border border-border-dark bg-panel overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : sources.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No sources yet. Add a website, Zendesk, or other source.</div>
          ) : (
            <ul className="divide-y divide-border-dark">
              {sources.map((s) => (
                <li key={s.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {editSource?.id === s.id ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const form = e.currentTarget;
                            const name = (form.querySelector('[name="name"]') as HTMLInputElement)?.value?.trim();
                            const maxPages = parseInt((form.querySelector('[name="maxPages"]') as HTMLInputElement)?.value || "500", 10);
                            const url = (form.querySelector('[name="url"]') as HTMLInputElement)?.value?.trim() || undefined;
                            if (name) handleUpdateSource(s.id, s.type === "WEBSITE" ? { name, maxPages, url } : { name });
                          }}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <input name="name" type="text" defaultValue={s.name} className="rounded border border-border-dark bg-surface px-2 py-1 text-white w-48" />
                          {s.type === "WEBSITE" && (
                            <>
                              <input name="url" type="text" defaultValue={s.url || ""} placeholder="URL" className="rounded border border-border-dark bg-surface px-2 py-1 text-white flex-1 min-w-0" />
                              <input name="maxPages" type="number" defaultValue={s.maxPages} min={1} max={50000} className="rounded border border-border-dark bg-surface px-2 py-1 text-white w-24" />
                            </>
                          )}
                          <button type="submit" className="text-accent text-sm hover:underline">Save</button>
                          <button type="button" onClick={() => setEditSource(null)} className="text-gray-400 text-sm hover:underline">Cancel</button>
                        </form>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <StatusDot status={s.status} />
                            <span className="font-medium text-white">{s.name}</span>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-gray-300">{s.type.replace("_", " ")}</span>
                            <span className="text-xs text-gray-500">{s.chunkCount} chunks · {formatDate(s.lastSyncedAt)}</span>
                            <button type="button" onClick={() => setEditSource(s)} className="text-xs text-accent hover:underline">Edit</button>
                          </div>
                          {s.status === "FAILED" && s.errorMessage && (
                            <p className="mt-1 text-sm text-red-400">{s.errorMessage}</p>
                          )}
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button type="button" onClick={async () => { await api.syncSource(s.id); loadSources(); }} className="p-2 text-gray-400 hover:text-white" title="Re-sync"><RefreshCw className="h-4 w-4" /></button>
                      <button type="button" onClick={async () => { const d = await api.getSource(s.id); setChunksDrawer(d); }} className="p-2 text-gray-400 hover:text-white" title="View chunks"><BookOpen className="h-4 w-4" /></button>
                      <button type="button" onClick={async () => { if (confirm("Remove this source?")) { await api.deleteSource(s.id); loadSources(); setChunksDrawer((c) => c?.id === s.id ? null : c); } }} className="p-2 text-gray-400 hover:text-red-400" title="Remove"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* System prompt */}
      <section>
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-2">System Prompt</h2>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={6}
          className="w-full rounded-lg border border-border-dark bg-panel px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-accent focus:outline-none"
          placeholder="AI system instructions..."
        />
        <div className="mt-2 flex items-center gap-3">
          <span className="text-xs text-gray-500">{systemPrompt.length} characters</span>
          {systemPromptSaved && <span className="text-xs text-green-400">Saved {new Date(systemPromptSaved).toLocaleTimeString()}</span>}
          <button type="button" onClick={handleSaveSystemPrompt} className="rounded bg-accent px-3 py-1.5 text-sm text-white hover:bg-accent-dark">Save</button>
        </div>
      </section>

      {/* Suggested questions */}
      <section>
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-2">Suggested Questions (chips on home page)</h2>
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <input
              key={i}
              type="text"
              value={suggestedQuestions[i] ?? ""}
              onChange={(e) => {
                const next = [...suggestedQuestions];
                next[i] = e.target.value;
                setSuggestedQuestions(next);
              }}
              placeholder={`Question ${i + 1}`}
              className="w-full max-w-md rounded-lg border border-border-dark bg-panel px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-accent focus:outline-none"
            />
          ))}
        </div>
        <div className="mt-2 flex items-center gap-3">
          {questionsSaved && <span className="text-xs text-green-400">Saved</span>}
          <button type="button" onClick={handleSaveSuggestedQuestions} className="rounded bg-accent px-3 py-1.5 text-sm text-white hover:bg-accent-dark">Save</button>
        </div>
      </section>

      {/* Add source modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setAddOpen(false)} aria-hidden />
          <div className="relative bg-panel border border-border-dark rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Add Source</h3>
            <form onSubmit={handleAddSource} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Type</label>
                <select value={addType} onChange={(e) => setAddType(e.target.value)} className="w-full rounded border border-border-dark bg-surface px-3 py-2 text-white">
                  {SOURCE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Name</label>
                <input type="text" value={addName} onChange={(e) => setAddName(e.target.value)} required className="w-full rounded border border-border-dark bg-surface px-3 py-2 text-white" placeholder="e.g. MDT Website" />
              </div>
              {addType === "ZENDESK" && (
                <p className="text-sm text-gray-400">Credentials are configured on the Connections page.</p>
              )}
              {addType === "WEBSITE" && (
                <>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">URL</label>
                    <input type="text" value={addUrl} onChange={(e) => setAddUrl(e.target.value)} className="w-full rounded border border-border-dark bg-surface px-3 py-2 text-white" placeholder="https://..." />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Max pages</label>
                    <input type="number" value={addMaxPages} onChange={(e) => setAddMaxPages(parseInt(e.target.value, 10) || 500)} min={1} max={50000} className="w-full rounded border border-border-dark bg-surface px-3 py-2 text-white" />
                  </div>
                </>
              )}
              {addType === "GOOGLE_DRIVE" && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Folder URL or ID</label>
                  <input type="text" value={addUrl} onChange={(e) => setAddUrl(e.target.value)} className="w-full rounded border border-border-dark bg-surface px-3 py-2 text-white" placeholder="https://drive.google.com/... or folder ID" />
                </div>
              )}
              {addType === "SHOPIFY" && <p className="text-sm text-gray-400">Uses credentials from the Connections page.</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setAddOpen(false)} className="rounded px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
                <button type="submit" disabled={submitting} className="rounded bg-accent px-4 py-2 text-sm text-white hover:bg-accent-dark disabled:opacity-50">Add</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Chunks drawer */}
      {chunksDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setChunksDrawer(null)} aria-hidden />
          <div className="relative w-full max-w-xl bg-panel border-l border-border-dark flex flex-col shadow-xl max-h-screen">
            <div className="flex items-center justify-between p-4 border-b border-border-dark">
              <h3 className="text-lg font-semibold text-white">Chunks: {chunksDrawer.name}</h3>
              <button type="button" onClick={() => setChunksDrawer(null)} className="p-1 text-gray-400 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {chunksDrawer.chunks?.length === 0 ? (
                <p className="text-gray-400">No chunks yet.</p>
              ) : (
                chunksDrawer.chunks?.map((c) => (
                  <div key={c.id} className="rounded bg-white/5 p-3 text-sm">
                    {c.title && <p className="font-medium text-white mb-1">{c.title}</p>}
                    <p className="text-gray-300 whitespace-pre-wrap line-clamp-4">{c.content}</p>
                    {c.url && <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-accent text-xs hover:underline mt-1 inline-block">{c.url}</a>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
