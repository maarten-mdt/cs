import { useState, useEffect } from "react";
import { api, type AnalyticsSummary } from "../lib/api";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const PERIODS = [7, 30, 90] as const;

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "#4ade80",
  neutral: "#94a3b8",
  negative: "#f87171",
  frustrated: "#ef4444",
};

const SENTIMENT_LABELS: Record<string, string> = {
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative",
  frustrated: "Frustrated",
};

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

  const sentimentData = Object.entries(summary.sentimentBreakdown ?? {}).map(([key, value]) => ({
    name: SENTIMENT_LABELS[key] || key,
    value,
    color: SENTIMENT_COLORS[key] || "#6b7280",
  }));

  const totalFeedback = (summary.thumbsUp ?? 0) + (summary.thumbsDown ?? 0);
  const satisfactionRate = totalFeedback > 0 ? Math.round(((summary.thumbsUp ?? 0) / totalFeedback) * 100) : null;

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

      {/* Key metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="rounded-lg border border-border-dark bg-panel p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Conversations</p>
          <p className="text-2xl font-semibold text-white mt-1">{summary.totalConversations}</p>
        </div>
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
          <p className="text-xs text-gray-400 uppercase tracking-wider">Thumbs up</p>
          <p className="text-2xl font-semibold text-green-400 mt-1">{summary.thumbsUp ?? 0}</p>
        </div>
        <div className="rounded-lg border border-border-dark bg-panel p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Thumbs down</p>
          <p className="text-2xl font-semibold text-red-400 mt-1">{summary.thumbsDown ?? 0}</p>
        </div>
      </div>

      {/* Satisfaction bar */}
      {satisfactionRate !== null && (
        <div className="rounded-lg border border-border-dark bg-panel p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium text-gray-400">Customer Satisfaction</h2>
            <span className="text-sm text-white font-semibold">{satisfactionRate}%</span>
          </div>
          <div className="h-3 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${satisfactionRate}%`,
                backgroundColor: satisfactionRate >= 80 ? "#4ade80" : satisfactionRate >= 60 ? "#facc15" : "#f87171",
              }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">{totalFeedback} total ratings</p>
        </div>
      )}

      {/* Daily volume + Sentiment side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-lg border border-border-dark bg-panel p-4">
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
          <h2 className="text-sm font-medium text-gray-400 mb-4">Customer Sentiment</h2>
          {sentimentData.length > 0 ? (
            <div>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={sentimentData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={70}
                      dataKey="value"
                      stroke="none"
                    >
                      {sentimentData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: "#202224", border: "1px solid #2a2c2f" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5 mt-2">
                {sentimentData.map((s) => (
                  <div key={s.name} className="flex items-center gap-2 text-sm">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="text-gray-300 flex-1">{s.name}</span>
                    <span className="text-gray-400">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 text-gray-500">No sentiment data yet</div>
          )}
        </div>
      </div>

      {/* Topics with sentiment indicators */}
      <div className="rounded-lg border border-border-dark bg-panel p-4">
        <h2 className="text-sm font-medium text-gray-400 mb-4">Topics</h2>
        {summary.topTopics.length > 0 ? (
          <div className="space-y-3">
            {summary.topTopics.map((t, i) => {
              const topicSentiments = summary.topicSentimentMap?.[t.topic] ?? {};
              const neg = (topicSentiments.negative ?? 0) + (topicSentiments.frustrated ?? 0);
              const pos = topicSentiments.positive ?? 0;
              const neu = topicSentiments.neutral ?? 0;
              const total = neg + pos + neu || 1;
              return (
                <div key={t.topic} className="space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500 w-6 text-right text-sm">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-white text-sm font-medium truncate">{t.topic}</span>
                        <span className="text-gray-400 text-sm ml-2 shrink-0">{t.count} conversations</span>
                      </div>
                      <div className="flex h-1.5 rounded-full overflow-hidden mt-1 bg-white/5">
                        {pos > 0 && (
                          <div className="bg-green-400" style={{ width: `${(pos / total) * 100}%` }} />
                        )}
                        {neu > 0 && (
                          <div className="bg-gray-400" style={{ width: `${(neu / total) * 100}%` }} />
                        )}
                        {neg > 0 && (
                          <div className="bg-red-400" style={{ width: `${(neg / total) * 100}%` }} />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-gray-500">No topic data yet. Topics are auto-assigned when conversations end.</p>
        )}
      </div>
    </div>
  );
}
