import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

interface Message {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

interface Props {
  apiUrl: string;
}

export function ConversationDetail({ apiUrl }: Props) {
  const { id } = useParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`${apiUrl}/api/chat/conversations/${id}/messages`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(setMessages)
      .catch(() => setError("Failed to load messages"))
      .finally(() => setLoading(false));
  }, [apiUrl, id]);

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">Loading...</div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-700 p-4 rounded-lg">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link to="/" className="text-green-600 hover:text-green-800 font-medium">
        ← Back to conversations
      </Link>
      <h1 className="text-2xl font-semibold text-gray-900">
        Conversation {id?.slice(0, 8)}...
      </h1>
      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`p-4 rounded-lg ${
              m.role === "user"
                ? "bg-green-50 ml-8"
                : "bg-gray-100 mr-8"
            }`}
          >
            <div className="text-xs font-medium text-gray-500 mb-1 uppercase">
              {m.role}
            </div>
            <div className="text-gray-900 whitespace-pre-wrap">{m.content}</div>
            <div className="text-xs text-gray-400 mt-2">
              {new Date(m.created_at).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
