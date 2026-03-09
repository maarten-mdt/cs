import { useState, useEffect } from "react";
import { api, type AnalyticsSummary } from "../lib/api";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const PERIODS = [7, 30, 90] as const;

export function AnalyticsPage() {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getAnalyticsSummary(days).then(setData).catch(console.error).finally(() => setLoading(false));
  }, [days]);

  if (loading && !data) return <div className="text-gray-400">Loading...</div>;

  const summary = data ?? {
    totalConversations: 0,
    resolvedCount: 0,
    escalatedCount: 0,
    deflectionRate: 0,
    avgMessages: 0,
    topTopics: [],
    dailyVolume: [],
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Analytics</h1>
        <div className="flex gap-2">
          {PERIODS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`rounded px-3 py-1.5 text-sm ${days === d ? "bg-accent text-white" : "bg-white/5 text-gray-400 hover:text-white"}`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-lg border border-border-dark bg-panel p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Deflection rate</p>
          <p className="text-2xl font-semibold text-white mt-1">{summary.deflectionRate}%</p>
        </div>
        <div className="rounded-lg border border-border-dark bg-panel p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Avg session</p>
          <p className="text-2xl font-semibold text-white mt-1">{summary.avgMessages} msgs</p>
        </div>
        <div className="rounded-lg border border-border-dark bg-panel p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Escalations</p>
          <p className="text-2xl font-semibold text-white mt-1">{summary.escalatedCount}</p>
        </div>
        <div className="rounded-lg border border-border-dark bg-panel p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Conversations</p>
          <p className="text-2xl font-semibold text-white mt-1">{summary.totalConversations}</p>
        </div>
      </div>

      <div className="rounded-lg border border-border-dark bg-panel p-4">
        <h2 className="text-sm font-medium text-gray-400 mb-4">Daily volume</h2>
        <div className="h-64">
          {summary.dailyVolume.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.dailyVolume}>
                <XAxis dataKey="date" tick={{ fill: "#9ca3af", fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: "#202224", border: "1px solid #2a2c2f" }} labelFormatter={(v) => v} />
                <Bar dataKey="count" fill="#86a33d" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">No data for this period</div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border-dark bg-panel p-4">
        <h2 className="text-sm font-medium text-gray-400 mb-4">Top topics</h2>
        {summary.topTopics.length > 0 ? (
          <div className="space-y-2">
            {summary.topTopics.map((t, i) => (
              <div key={t.topic} className="flex items-center gap-3">
                <span className="text-gray-400 w-8">{i + 1}.</span>
                <div className="flex-1 flex items-center gap-2">
                  <div className="bg-accent/30 h-6 rounded" style={{ width: `${Math.min(100, (t.count / (summary.topTopics[0]?.count ?? 1)) * 100)}%` }} />
                  <span className="text-white text-sm">{t.topic}</span>
                </div>
                <span className="text-gray-400 text-sm">{t.count}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No topic data yet</p>
        )}
      </div>
    </div>
  );
}
