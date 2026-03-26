import { useState, useEffect } from "react";
import { hubApi, type CannedResponse } from "../../lib/hubApi";
import { Plus, Pencil, Trash2, X } from "lucide-react";

export function CannedResponsesPage() {
  const [responses, setResponses] = useState<CannedResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CannedResponse | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    hubApi.getCannedResponses().then(setResponses).catch(console.error).finally(() => setLoading(false));
  }, []);

  const handleSave = async (data: { shortcut: string; title: string; content: string; category?: string }) => {
    if (editing) {
      const updated = await hubApi.updateCannedResponse(editing.id, data);
      setResponses((r) => r.map((item) => (item.id === editing.id ? updated : item)));
    } else {
      const created = await hubApi.createCannedResponse(data);
      setResponses((r) => [...r, created]);
    }
    setShowForm(false);
    setEditing(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this canned response?")) return;
    await hubApi.deleteCannedResponse(id);
    setResponses((r) => r.filter((item) => item.id !== id));
  };

  if (loading) return <div className="text-gray-400 animate-pulse">Loading...</div>;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-white">Canned Responses</h1>
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white text-sm rounded-lg hover:bg-accent/80"
        >
          <Plus className="h-4 w-4" />
          New Response
        </button>
      </div>

      {showForm && (
        <CannedForm
          initial={editing || undefined}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      <div className="space-y-2">
        {responses.map((r) => (
          <div key={r.id} className="bg-panel border border-border-dark rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <code className="text-xs text-accent bg-accent/10 px-2 py-0.5 rounded">/{r.shortcut}</code>
                <span className="text-sm font-medium text-white">{r.title}</span>
                {r.category && (
                  <span className="text-[10px] px-2 py-0.5 bg-white/5 text-gray-400 rounded">{r.category}</span>
                )}
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => { setEditing(r); setShowForm(true); }}
                  className="p-1.5 text-gray-400 hover:text-white"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(r.id)}
                  className="p-1.5 text-gray-400 hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-400 whitespace-pre-wrap">{r.content}</p>
          </div>
        ))}
        {responses.length === 0 && (
          <p className="text-sm text-gray-500 py-8 text-center">No canned responses yet. Create one to get started.</p>
        )}
      </div>
    </div>
  );
}

function CannedForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: CannedResponse;
  onSave: (data: { shortcut: string; title: string; content: string; category?: string }) => void;
  onCancel: () => void;
}) {
  const [shortcut, setShortcut] = useState(initial?.shortcut || "");
  const [title, setTitle] = useState(initial?.title || "");
  const [content, setContent] = useState(initial?.content || "");
  const [category, setCategory] = useState(initial?.category || "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ shortcut: shortcut.trim(), title: title.trim(), content: content.trim(), category: category.trim() || undefined });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-panel border border-border-dark rounded-lg p-4 mb-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Shortcut</label>
          <input
            value={shortcut}
            onChange={(e) => setShortcut(e.target.value)}
            placeholder="e.g. thanks"
            required
            className="w-full bg-surface border border-border-dark rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Thank you message"
            required
            className="w-full bg-surface border border-border-dark rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Category</label>
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="e.g. Closings, Greetings"
          className="w-full bg-surface border border-border-dark rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Content</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          required
          placeholder="The full response text..."
          className="w-full bg-surface border border-border-dark rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent resize-none"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-400 hover:text-white">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="px-4 py-1.5 bg-accent text-white text-sm rounded-lg hover:bg-accent/80 disabled:opacity-50">
          {saving ? "Saving..." : initial ? "Update" : "Create"}
        </button>
      </div>
    </form>
  );
}

export default CannedResponsesPage;
