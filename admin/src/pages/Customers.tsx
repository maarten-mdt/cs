import { useEffect, useState } from "react";

interface Customer {
  id: string;
  email: string;
  name: string | null;
  address: string | null;
  last_seen_at: string | null;
  conversation_count: number;
  created_at: string;
  metadata: Record<string, unknown>;
}

interface Props {
  apiUrl: string;
}

export function Customers({ apiUrl }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mergeDuplicateEmail, setMergeDuplicateEmail] = useState<string | null>(null);
  const [mergePrimaryEmail, setMergePrimaryEmail] = useState("");
  const [mergeSubmitting, setMergeSubmitting] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);

  const load = () =>
    fetch(`${apiUrl}/api/customers`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(setCustomers)
      .catch(() => setError("Failed to load customers"))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, [apiUrl]);

  const startMerge = (email: string) => {
    setMergeDuplicateEmail(email);
    setMergePrimaryEmail("");
    setMergeError(null);
  };

  const cancelMerge = () => {
    setMergeDuplicateEmail(null);
    setMergePrimaryEmail("");
    setMergeError(null);
  };

  const submitMerge = () => {
    if (!mergeDuplicateEmail || !mergePrimaryEmail.trim()) return;
    const primary = mergePrimaryEmail.trim();
    if (primary === mergeDuplicateEmail) {
      setMergeError("Choose a different customer as the primary.");
      return;
    }
    setMergeSubmitting(true);
    setMergeError(null);
    fetch(`${apiUrl}/api/customers/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        primaryEmail: primary,
        duplicateEmail: mergeDuplicateEmail,
      }),
    })
      .then((r) => r.json().then((d) => ({ ok: r.ok, body: d })))
      .then(({ ok, body }) => {
        if (ok) {
          cancelMerge();
          load();
        } else {
          setMergeError(body?.error || "Merge failed");
        }
      })
      .catch(() => setMergeError("Merge failed"))
      .finally(() => setMergeSubmitting(false));
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Customers</h1>
      <p className="text-gray-600">
        Everyone who has interacted with the bot. Identified by email. When the same person appears with different emails (e.g. same name and address), merge them so one record is the primary.
      </p>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading...</div>
      ) : error ? (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg">{error}</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Address</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Conversations</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last seen</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    No customers yet. They appear here once someone chats with the bot and provides an email.
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">{c.email}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{c.name || "—"}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate" title={c.address || undefined}>
                      {c.address || "—"}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{c.conversation_count}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {c.last_seen_at ? new Date(c.last_seen_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => startMerge(c.email)}
                        className="text-green-600 hover:text-green-800 font-medium text-sm"
                      >
                        Merge into…
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {mergeDuplicateEmail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Merge customer</h2>
            <p className="text-gray-600 text-sm mb-4">
              Merge <strong>{mergeDuplicateEmail}</strong> into another customer. Their conversations will be reassigned and this record will be marked as merged.
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-1">Primary customer (keep this one)</label>
            <select
              value={mergePrimaryEmail}
              onChange={(e) => setMergePrimaryEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-green-500 focus:border-green-500"
            >
              <option value="">Select customer…</option>
              {customers
                .filter((c) => c.email !== mergeDuplicateEmail)
                .map((c) => (
                  <option key={c.id} value={c.email}>
                    {c.email} {c.name ? `(${c.name})` : ""}
                  </option>
                ))}
            </select>
            {mergeError && (
              <p className="mt-2 text-sm text-red-600">{mergeError}</p>
            )}
            <div className="mt-6 flex gap-3 justify-end">
              <button
                type="button"
                onClick={cancelMerge}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitMerge}
                disabled={!mergePrimaryEmail.trim() || mergeSubmitting}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {mergeSubmitting ? "Merging…" : "Merge"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
