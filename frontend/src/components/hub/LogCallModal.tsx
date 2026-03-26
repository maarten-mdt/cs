import { useState } from "react";
import { hubApi } from "../../lib/hubApi";
import { useHubStore } from "../../stores/hubStore";
import { X, Phone } from "lucide-react";

interface Props {
  ticketId: string;
  customerPhone?: string;
  onClose: () => void;
}

export function LogCallModal({ ticketId, customerPhone, onClose }: Props) {
  const addMessage = useHubStore((s) => s.addMessage);
  const currentAgent = useHubStore((s) => s.currentAgent);

  const [direction, setDirection] = useState<"INBOUND" | "OUTBOUND">("INBOUND");
  const [status, setStatus] = useState<string>("COMPLETED");
  const [phoneNumber, setPhoneNumber] = useState(customerPhone || "");
  const [durationMin, setDurationMin] = useState("");
  const [durationSec, setDurationSec] = useState("");
  const [summary, setSummary] = useState("");
  const [outcome, setOutcome] = useState("");
  const [followUp, setFollowUp] = useState(false);
  const [followUpNote, setFollowUpNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (summary.trim().length < 10) {
      setError("Summary must be at least 10 characters");
      return;
    }

    const durationSeconds =
      (parseInt(durationMin || "0") * 60) + parseInt(durationSec || "0") || null;
    const now = new Date();
    const startedAt = durationSeconds
      ? new Date(now.getTime() - durationSeconds * 1000).toISOString()
      : now.toISOString();

    setSaving(true);
    try {
      const call = await hubApi.logCall(ticketId, {
        direction,
        status,
        phoneFrom: direction === "INBOUND" ? phoneNumber : "",
        phoneTo: direction === "OUTBOUND" ? phoneNumber : "",
        startedAt,
        endedAt: now.toISOString(),
        durationSeconds,
        summary: summary.trim(),
        outcome: outcome.trim() || null,
        followUpRequired: followUp,
        followUpNote: followUp ? followUpNote.trim() : null,
      });

      // Add system message optimistically
      const dirLabel = direction === "INBOUND" ? "Inbound" : "Outbound";
      addMessage(ticketId, {
        id: `call-${call.id}`,
        role: "SYSTEM",
        content: `📞 ${dirLabel} call logged by ${currentAgent?.name || currentAgent?.email || "Agent"} — ${durationSeconds || 0}s\nSummary: ${summary.trim()}`,
        channel: null,
        senderAgentId: null,
        isInternal: false,
        feedback: null,
        createdAt: new Date().toISOString(),
      });

      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to log call");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-panel border border-border-dark rounded-xl w-full max-w-md mx-4 shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-dark">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-accent" />
            <h3 className="text-sm font-medium text-white">Log Phone Call</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Direction */}
          <div className="flex gap-2">
            {(["INBOUND", "OUTBOUND"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDirection(d)}
                className={`flex-1 py-2 text-xs rounded-lg border ${
                  direction === d
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border-dark text-gray-400 hover:text-white"
                }`}
              >
                {d}
              </button>
            ))}
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full bg-surface border border-border-dark rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
            >
              <option value="COMPLETED">Completed</option>
              <option value="MISSED">Missed</option>
              <option value="VOICEMAIL">Voicemail</option>
              <option value="NO_ANSWER">No Answer</option>
            </select>
          </div>

          {/* Phone number */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Phone Number</label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+1 (208) 555-0142"
              className="w-full bg-surface border border-border-dark rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent"
            />
          </div>

          {/* Duration */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Duration</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                value={durationMin}
                onChange={(e) => setDurationMin(e.target.value)}
                placeholder="0"
                className="w-16 bg-surface border border-border-dark rounded-lg px-3 py-2 text-sm text-white text-center focus:outline-none focus:border-accent"
              />
              <span className="text-xs text-gray-400">min</span>
              <input
                type="number"
                min="0"
                max="59"
                value={durationSec}
                onChange={(e) => setDurationSec(e.target.value)}
                placeholder="0"
                className="w-16 bg-surface border border-border-dark rounded-lg px-3 py-2 text-sm text-white text-center focus:outline-none focus:border-accent"
              />
              <span className="text-xs text-gray-400">sec</span>
            </div>
          </div>

          {/* Summary */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Summary *</label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="What was discussed on this call?"
              rows={3}
              className="w-full bg-surface border border-border-dark rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent resize-none"
            />
          </div>

          {/* Outcome */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Outcome</label>
            <input
              type="text"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              placeholder="e.g. Reshipped order, Escalated to manager"
              className="w-full bg-surface border border-border-dark rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent"
            />
          </div>

          {/* Follow-up */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={followUp}
              onChange={(e) => setFollowUp(e.target.checked)}
              className="rounded border-border-dark bg-surface text-accent"
            />
            <label className="text-xs text-gray-400">Follow-up required</label>
          </div>
          {followUp && (
            <textarea
              value={followUpNote}
              onChange={(e) => setFollowUpNote(e.target.value)}
              placeholder="Follow-up details..."
              rows={2}
              className="w-full bg-surface border border-border-dark rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent resize-none"
            />
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 bg-accent text-white text-sm rounded-lg hover:bg-accent/80 disabled:opacity-50"
          >
            {saving ? "Logging..." : "Log Call"}
          </button>
        </form>
      </div>
    </div>
  );
}
