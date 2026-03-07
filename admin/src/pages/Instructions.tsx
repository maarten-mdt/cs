import { useEffect, useState } from "react";

interface Props {
  apiUrl: string;
}

const DEFAULT_PLACEHOLDER = `e.g.:
- Always respond in a friendly, professional tone.
- Keep answers concise; offer to elaborate if needed.
- If unsure, say so and suggest contacting support.
- Never guess order numbers or tracking details.`;

export function Instructions({ apiUrl }: Props) {
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiUrl}/api/widget/config`)
      .then((r) => r.json())
      .then((data) => setInstructions(data.behaviorInstructions || ""))
      .catch(() => setMessage("Failed to load"))
      .finally(() => setLoading(false));
  }, [apiUrl]);

  const handleSave = () => {
    setSaving(true);
    setMessage(null);
    fetch(`${apiUrl}/api/widget/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ behaviorInstructions: instructions }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(() => setMessage("Saved."))
      .catch(() => setMessage("Failed to save"))
      .finally(() => setSaving(false));
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">Loading...</div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-semibold text-gray-900">Behavior instructions</h1>
      <p className="text-gray-600">
        Describe how the bot should behave: tone, style, and rules. This is not data or knowledge—only behavior. The instructions are added to the bot’s system prompt so it follows them in every reply.
      </p>

      <div className="bg-white rounded-lg shadow p-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Instructions for the bot
        </label>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder={DEFAULT_PLACEHOLDER}
          rows={14}
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        />
        {message && (
          <div
            className={`mt-4 rounded-lg p-3 text-sm ${
              message === "Saved." ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}
          >
            {message}
          </div>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-4 rounded-lg bg-green-600 px-6 py-2 text-white hover:bg-green-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
