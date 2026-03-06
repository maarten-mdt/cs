import { useEffect, useState } from "react";

interface Props {
  apiUrl: string;
}

export function Settings({ apiUrl }: Props) {
  const [greeting, setGreeting] = useState("");
  const [suggestedQuestions, setSuggestedQuestions] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiUrl}/api/widget/config`)
      .then((r) => r.json())
      .then((cfg) => {
        setGreeting(cfg.greeting || "");
        setSuggestedQuestions(
          Array.isArray(cfg.suggestedQuestions)
            ? cfg.suggestedQuestions.join("\n")
            : ""
        );
      })
      .catch(() => setMessage("Failed to load settings"))
      .finally(() => setLoading(false));
  }, [apiUrl]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const questions = suggestedQuestions
        .split("\n")
        .map((q) => q.trim())
        .filter(Boolean);
      const res = await fetch(`${apiUrl}/api/widget/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          greeting: greeting.trim(),
          suggestedQuestions: questions.length > 0 ? questions : undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setMessage("Saved successfully");
    } catch {
      setMessage("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">Loading settings...</div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold text-gray-900">Widget Settings</h1>
      <p className="text-gray-600">
        Configure the greeting and suggested questions shown in the chat widget.
      </p>

      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Greeting message
          </label>
          <textarea
            value={greeting}
            onChange={(e) => setGreeting(e.target.value)}
            rows={2}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            placeholder="Hi! How can I help you today?"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Suggested questions (one per line)
          </label>
          <textarea
            value={suggestedQuestions}
            onChange={(e) => setSuggestedQuestions(e.target.value)}
            rows={4}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            placeholder="Where is my order?&#10;Product compatibility&#10;Return policy"
          />
        </div>

        {message && (
          <div
            className={`p-3 rounded-lg ${
              message.includes("Failed")
                ? "bg-red-50 text-red-700"
                : "bg-green-50 text-green-700"
            }`}
          >
            {message}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
