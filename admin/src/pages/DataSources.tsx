import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

interface DataSource {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  last_synced_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  created_at: string;
}

interface Props {
  apiUrl: string;
}

export function DataSources({ apiUrl }: Props) {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"website" | "zendesk" | "shopify_products">("website");
  const [newConfig, setNewConfig] = useState("");
  const [syncing, setSyncing] = useState<string | null>(null);

  const fetchSources = () => {
    fetch(`${apiUrl}/api/sources`)
      .then((r) => r.json())
      .then(setSources)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSources();
  }, [apiUrl]);

  const handleAdd = () => {
    let config: Record<string, unknown> = {};
    try {
      if (newConfig.trim()) config = JSON.parse(newConfig);
    } catch {
      alert("Invalid JSON config");
      return;
    }
    if (newType === "website" && !config.baseUrl) {
      config.baseUrl = "https://mdttac.com";
      config.maxPages = 50;
    }
    fetch(`${apiUrl}/api/sources`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, type: newType, config }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(() => {
        setShowAdd(false);
        setNewName("");
        setNewConfig("");
        fetchSources();
      })
      .catch(() => alert("Failed to add source"));
  };

  const handleSync = (id: string) => {
    setSyncing(id);
    fetch(`${apiUrl}/api/sources/${id}/sync`, { method: "POST" })
      .then((r) => r.json())
      .then(() => fetchSources())
      .catch(() => alert("Sync failed"))
      .finally(() => setSyncing(null));
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">Loading sources...</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Data Sources</h1>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          {showAdd ? "Cancel" : "Add source"}
        </button>
      </div>

      <p className="text-gray-600">
        Add and sync data from your website, Zendesk Help Center, or Shopify products. The chatbot uses this knowledge to answer customer questions.
      </p>

      {showAdd && (
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="font-medium text-gray-900">New data source</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. MDT Website"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as typeof newType)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            >
              <option value="website">Website (crawl)</option>
              <option value="zendesk">Zendesk Help Center</option>
              <option value="shopify_products">Shopify products</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Config (JSON) – optional for website use default
            </label>
            <textarea
              value={newConfig}
              onChange={(e) => setNewConfig(e.target.value)}
              placeholder={
                newType === "website"
                  ? '{"baseUrl": "https://mdttac.com", "maxPages": 50}'
                  : newType === "zendesk"
                  ? '{"locale": "en-us", "maxArticles": 200}'
                  : "{}"
              }
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg font-mono text-sm"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={!newName.trim()}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            Add source
          </button>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last sync</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {sources.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                  No data sources yet. Add one to feed the chatbot with your content.
                </td>
              </tr>
            ) : (
              sources.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">{s.name}</td>
                  <td className="px-6 py-4 text-gray-600">{s.type}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {s.last_synced_at
                      ? new Date(s.last_synced_at).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-6 py-4">
                    {s.last_sync_error ? (
                      <span className="text-red-600 text-sm" title={s.last_sync_error}>
                        Failed
                      </span>
                    ) : s.last_sync_status ? (
                      <span className="text-green-600 text-sm">{s.last_sync_status}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <Link
                      to={`/sources/${s.id}`}
                      className="text-green-600 hover:text-green-800 font-medium"
                    >
                      View chunks
                    </Link>
                    {s.type !== "manual" && (
                      <button
                        onClick={() => handleSync(s.id)}
                        disabled={syncing === s.id}
                        className="text-blue-600 hover:text-blue-800 disabled:opacity-50"
                      >
                        {syncing === s.id ? "Syncing…" : "Sync"}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
