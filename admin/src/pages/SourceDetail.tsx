import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

interface Chunk {
  id: string;
  content: string;
  title: string | null;
  url: string | null;
  created_at: string;
}

interface Source {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  last_sync_status: string | null;
  last_sync_error: string | null;
}

interface Props {
  apiUrl: string;
}

export function SourceDetail({ apiUrl }: Props) {
  const { id } = useParams();
  const [source, setSource] = useState<Source | null>(null);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [websiteMaxPages, setWebsiteMaxPages] = useState(500);
  const [savingConfig, setSavingConfig] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const loadSource = () => {
    if (!id) return;
    fetch(`${apiUrl}/api/sources/${id}`)
      .then((r) => r.json())
      .then((s) => {
        setSource(s);
        if (s.type === "website" && typeof s.config?.maxPages === "number") {
          setWebsiteMaxPages(s.config.maxPages);
        }
      })
      .catch(() => {});
  };

  const loadChunks = () => {
    if (!id) return;
    fetch(`${apiUrl}/api/sources/${id}/chunks`)
      .then((r) => r.json())
      .then(setChunks)
      .catch(() => {});
  };

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`${apiUrl}/api/sources/${id}`).then((r) => r.json()),
      fetch(`${apiUrl}/api/sources/${id}/chunks`).then((r) => r.json()),
    ])
      .then(([s, c]) => {
        setSource(s);
        setChunks(c);
        if (s.type === "website" && typeof s.config?.maxPages === "number") {
          setWebsiteMaxPages(s.config.maxPages);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiUrl, id]);

  const saveWebsiteConfig = () => {
    if (!id || !source) return;
    setSavingConfig(true);
    const config = { ...source.config, maxPages: Math.min(50000, Math.max(1, websiteMaxPages)) };
    fetch(`${apiUrl}/api/sources/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    })
      .then((r) => (r.ok ? loadSource() : Promise.reject()))
      .catch(() => {})
      .finally(() => setSavingConfig(false));
  };

  const handleSync = () => {
    if (!id) return;
    setSyncing(true);
    fetch(`${apiUrl}/api/sources/${id}/sync`, { method: "POST" })
      .then((r) => r.json())
      .then(() => {
        loadSource();
        loadChunks();
      })
      .catch(() => {})
      .finally(() => setSyncing(false));
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">Loading chunks...</div>
    );
  }

  const isWebsite = source?.type === "website";

  return (
    <div className="space-y-4">
      <Link to="/sources" className="text-green-600 hover:text-green-800 font-medium">
        ← Back to data sources
      </Link>
      <h1 className="text-2xl font-semibold text-gray-900">{source?.name ?? "Source"}</h1>
      {source?.last_sync_error && (
        <div className="bg-red-50 text-red-700 px-4 py-2 rounded-lg text-sm">{source.last_sync_error}</div>
      )}
      {isWebsite && (
        <div className="bg-gray-50 rounded-lg p-4 flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max pages to crawl</label>
            <input
              type="number"
              min={1}
              max={50000}
              value={websiteMaxPages}
              onChange={(e) => setWebsiteMaxPages(Number(e.target.value) || 200)}
              className="w-32 px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <button
            type="button"
            onClick={saveWebsiteConfig}
            disabled={savingConfig}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
          >
            {savingConfig ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {syncing ? "Syncing…" : "Sync again"}
          </button>
          <p className="text-xs text-gray-500 w-full">Save then Sync again. Use 500–2000+ for large sites (sync may take several minutes).</p>
        </div>
      )}
      <p className="text-gray-600">
        {chunks.length} chunk{chunks.length !== 1 ? "s" : ""} from this source. Used by the chatbot for answers.
      </p>
      <div className="space-y-4">
        {chunks.map((c) => (
          <div
            key={c.id}
            className="bg-white rounded-lg shadow p-4 border border-gray-100"
          >
            {c.title && (
              <div className="font-medium text-gray-900 mb-1">{c.title}</div>
            )}
            {c.url && (
              <a
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-green-600 hover:underline block mb-2"
              >
                {c.url}
              </a>
            )}
            <p className="text-sm text-gray-600 line-clamp-3">{c.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
