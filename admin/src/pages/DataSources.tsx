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

type AddSourceType = "website" | "zendesk" | "shopify_products" | "google_drive";

export function DataSources({ apiUrl }: Props) {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState<AddSourceType | null>(null);
  const [newName, setNewName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [websiteWholeSite, setWebsiteWholeSite] = useState(true);
  const [driveFolderUrl, setDriveFolderUrl] = useState("");
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

  const buildConfig = (): Record<string, unknown> => {
    if (showAdd === "website") {
      return {
        baseUrl: websiteUrl.trim().replace(/\/$/, "") || undefined,
        singlePage: !websiteWholeSite,
        maxPages: websiteWholeSite ? 50 : 1,
      };
    }
    if (showAdd === "google_drive") {
      return { folderId: driveFolderUrl.trim() || undefined };
    }
    return {};
  };

  const canAdd = () => {
    if (!newName.trim()) return false;
    if (showAdd === "website" && !websiteUrl.trim()) return false;
    if (showAdd === "google_drive" && !driveFolderUrl.trim()) return false;
    return true;
  };

  const handleAdd = () => {
    const config = buildConfig();
    const type = showAdd!;
    fetch(`${apiUrl}/api/sources`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), type, config }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(() => {
        setShowAdd(null);
        setNewName("");
        setWebsiteUrl("");
        setWebsiteWholeSite(true);
        setDriveFolderUrl("");
        fetchSources();
      })
      .catch((e) => alert(e?.message || "Failed to add source"));
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
      </div>

      <p className="text-gray-600">
        Add content from websites, Google Drive, Zendesk, or Shopify. Sources are synced daily at 2:00 AM.
      </p>

      {/* Add source buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setShowAdd(showAdd === "website" ? null : "website")}
          className={`px-4 py-2 rounded-lg border ${
            showAdd === "website" ? "bg-green-50 border-green-500 text-green-700" : "border-gray-300 hover:bg-gray-50"
          }`}
        >
          + Website
        </button>
        <button
          onClick={() => setShowAdd(showAdd === "google_drive" ? null : "google_drive")}
          className={`px-4 py-2 rounded-lg border ${
            showAdd === "google_drive" ? "bg-green-50 border-green-500 text-green-700" : "border-gray-300 hover:bg-gray-50"
          }`}
        >
          + Google Drive folder
        </button>
        <button
          onClick={() => setShowAdd(showAdd === "zendesk" ? null : "zendesk")}
          className={`px-4 py-2 rounded-lg border ${
            showAdd === "zendesk" ? "bg-green-50 border-green-500 text-green-700" : "border-gray-300 hover:bg-gray-50"
          }`}
        >
          + Zendesk Help Center
        </button>
        <button
          onClick={() => setShowAdd(showAdd === "shopify_products" ? null : "shopify_products")}
          className={`px-4 py-2 rounded-lg border ${
            showAdd === "shopify_products" ? "bg-green-50 border-green-500 text-green-700" : "border-gray-300 hover:bg-gray-50"
          }`}
        >
          + Shopify products
        </button>
      </div>

      {/* Add forms */}
      {showAdd === "website" && (
        <div className="bg-white rounded-lg shadow p-6 space-y-4 border border-gray-200">
          <h2 className="font-medium text-gray-900">Add website</h2>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
            <input
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://mdttac.com or https://mdttac.com/specific-page"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Crawl scope</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="scope"
                  checked={websiteWholeSite}
                  onChange={() => setWebsiteWholeSite(true)}
                />
                <span>Entire site (follow links from this URL)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="scope"
                  checked={!websiteWholeSite}
                  onChange={() => setWebsiteWholeSite(false)}
                />
                <span>Only this page</span>
              </label>
            </div>
          </div>
          <button
            onClick={handleAdd}
            disabled={!canAdd()}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            Add source
          </button>
        </div>
      )}

      {showAdd === "google_drive" && (
        <div className="bg-white rounded-lg shadow p-6 space-y-4 border border-gray-200">
          <h2 className="font-medium text-gray-900">Add Google Drive folder</h2>
          <p className="text-sm text-gray-500">
            Share the folder with your service account email. Set GOOGLE_SERVICE_ACCOUNT_JSON in env.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Support docs"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Folder URL or ID</label>
            <input
              value={driveFolderUrl}
              onChange={(e) => setDriveFolderUrl(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/XXX or paste folder ID"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={!canAdd()}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            Add source
          </button>
        </div>
      )}

      {showAdd === "zendesk" && (
        <div className="bg-white rounded-lg shadow p-6 space-y-4 border border-gray-200">
          <h2 className="font-medium text-gray-900">Add Zendesk Help Center</h2>
          <p className="text-sm text-gray-500">Uses ZENDESK_SUBDOMAIN, ZENDESK_EMAIL, ZENDESK_API_TOKEN.</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Zendesk Help"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
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

      {showAdd === "shopify_products" && (
        <div className="bg-white rounded-lg shadow p-6 space-y-4 border border-gray-200">
          <h2 className="font-medium text-gray-900">Add Shopify products</h2>
          <p className="text-sm text-gray-500">Uses SHOPIFY_SHOP and SHOPIFY_ACCESS_TOKEN.</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Product catalog"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
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
                  No data sources yet. Add one above.
                </td>
              </tr>
            ) : (
              sources.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">{s.name}</td>
                  <td className="px-6 py-4 text-gray-600">{s.type.replace(/_/g, " ")}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {s.last_synced_at ? new Date(s.last_synced_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-6 py-4">
                    {s.last_sync_error ? (
                      <span className="text-red-600 text-sm" title={s.last_sync_error}>Failed</span>
                    ) : s.last_sync_status ? (
                      <span className="text-green-600 text-sm">{s.last_sync_status}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <Link to={`/sources/${s.id}`} className="text-green-600 hover:text-green-800 font-medium">
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
