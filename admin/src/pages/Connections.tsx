import { useEffect, useState } from "react";

interface ConnectionMeta {
  name: string;
  label: string;
  configured: boolean;
}

interface ConnectionDetail {
  name: string;
  label: string;
  fields: { key: string; label: string; secret?: boolean }[];
  config: Record<string, string>;
  masked: Record<string, string>;
}

interface Props {
  apiUrl: string;
}

export function Connections({ apiUrl }: Props) {
  const [list, setList] = useState<ConnectionMeta[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConnectionDetail | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiUrl}/api/connections`)
      .then((r) => r.json())
      .then(setList)
      .catch(() => {});
  }, [apiUrl]);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    fetch(`${apiUrl}/api/connections/${selected}`)
      .then((r) => r.json())
      .then((d) => {
        setDetail(d);
        setForm(d.config || {});
      })
      .catch(() => setDetail(null));
  }, [apiUrl, selected]);

  const handleSave = () => {
    if (!selected) return;
    setSaving(true);
    setMessage(null);
    fetch(`${apiUrl}/api/connections/${selected}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
      .then((r) => (r.ok ? r.json() : r.json().then((e) => Promise.reject(e))))
      .then(() => {
        setMessage("Saved.");
        fetch(`${apiUrl}/api/connections`).then((r) => r.json()).then(setList);
      })
      .catch((e) => setMessage(e?.error || "Failed to save"))
      .finally(() => setSaving(false));
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Connections</h1>
      <p className="text-gray-600">
        Manage API keys and credentials for Shopify, Zendesk, Google Drive, HubSpot, Anthropic, and OpenAI. Values from env vars are used until you save here.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((c) => (
          <button
            key={c.name}
            onClick={() => setSelected(c.name)}
            className={`rounded-lg border p-4 text-left transition ${
              selected === c.name
                ? "border-green-500 bg-green-50"
                : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            <div className="font-medium text-gray-900">{c.label}</div>
            <div className="mt-1 text-sm text-gray-500">
              {c.configured ? "Configured" : "Not set"}
            </div>
          </button>
        ))}
      </div>

      {detail && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-medium text-gray-900">{detail.label}</h2>
          <div className="space-y-4">
            {detail.fields.map((f) => (
              <div key={f.key}>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {f.label}
                </label>
                {f.key === "serviceAccountJson" ? (
                  <textarea
                    value={form[f.key] ?? ""}
                    onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={
                      detail.masked?.[f.key]
                        ? "Leave blank to keep current value"
                        : "Paste JSON or value"
                    }
                    rows={6}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm"
                  />
                ) : (
                  <input
                    type={f.secret ? "password" : "text"}
                    value={form[f.key] ?? ""}
                    onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={
                      f.secret && detail.masked?.[f.key]
                        ? "Leave blank to keep current value"
                        : ""
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  />
                )}
                {f.secret && detail.masked?.[f.key] && !form[f.key] && (
                  <p className="mt-1 text-xs text-gray-500">Current: {detail.masked[f.key]}</p>
                )}
              </div>
            ))}
          </div>
          {message && (
            <div
              className={`mt-4 rounded-lg p-3 text-sm ${
                message === "Saved." ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"
              }`}
            >
              {message}
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => setSelected(null)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
