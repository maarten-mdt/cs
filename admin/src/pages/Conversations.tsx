import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { InlineChat } from "../components/InlineChat";

interface Conversation {
  id: string;
  customer_email: string | null;
  created_at: string;
  updated_at: string;
}

interface Props {
  apiUrl: string;
}

export function Conversations({ apiUrl }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiUrl}/api/chat/conversations`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(setConversations)
      .catch(() => setError("Failed to load conversations"))
      .finally(() => setLoading(false));
  }, [apiUrl]);

  return (
    <div className="space-y-8">
      <section className="flex justify-center">
        <InlineChat apiUrl={apiUrl} />
      </section>

      <section>
        <h1 className="text-2xl font-semibold text-gray-900 mb-4">Recent conversations</h1>
        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : error ? (
          <div className="bg-red-50 text-red-700 p-4 rounded-lg">{error}</div>
        ) : (
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Customer
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Started
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Updated
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {conversations.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                  No conversations yet.
                </td>
              </tr>
            ) : (
              conversations.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {c.customer_email || "Anonymous"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(c.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(c.updated_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <Link
                      to={`/conversations/${c.id}`}
                      className="text-green-600 hover:text-green-800 font-medium"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
        )}
      </section>
    </div>
  );
}
