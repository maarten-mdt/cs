import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

interface Chunk {
  id: string;
  content: string;
  title: string | null;
  url: string | null;
  created_at: string;
}

interface Props {
  apiUrl: string;
}

export function SourceDetail({ apiUrl }: Props) {
  const { id } = useParams();
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`${apiUrl}/api/sources/${id}/chunks`)
      .then((r) => r.json())
      .then(setChunks)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiUrl, id]);

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">Loading chunks...</div>
    );
  }

  return (
    <div className="space-y-4">
      <Link to="/sources" className="text-green-600 hover:text-green-800 font-medium">
        ← Back to data sources
      </Link>
      <h1 className="text-2xl font-semibold text-gray-900">Content chunks</h1>
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
