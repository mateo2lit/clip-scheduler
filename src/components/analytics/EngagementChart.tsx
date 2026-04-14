"use client";

import { useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

type Metric = {
  videoId: string;
  platform: string;
  title: string;
  views: number;
  likes: number;
  comments: number;
  shares?: number;
  postedAt: string;
};

type MetricKey = "views" | "likes" | "comments" | "engagement";

const METRIC_CONFIG: Record<MetricKey, { label: string; color: string; gradient: string }> = {
  views: { label: "Views", color: "#3b82f6", gradient: "url(#viewsGrad)" },
  likes: { label: "Likes", color: "#a855f7", gradient: "url(#likesGrad)" },
  comments: { label: "Comments", color: "#06b6d4", gradient: "url(#commentsGrad)" },
  engagement: { label: "Engagement Rate", color: "#10b981", gradient: "url(#engagementGrad)" },
};

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#0a0a0a]/95 backdrop-blur-sm px-4 py-3 shadow-xl">
      <p className="text-xs text-white/50 mb-2 font-medium">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-white/60">{entry.name}:</span>
          <span className="font-semibold text-white tabular-nums">
            {entry.dataKey === "engagement"
              ? `${entry.value.toFixed(2)}%`
              : entry.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function EngagementChart({
  metrics,
  range,
}: {
  metrics: Metric[];
  range: string;
}) {
  const [activeMetrics, setActiveMetrics] = useState<Set<MetricKey>>(
    new Set(["views", "likes"])
  );

  const chartData = useMemo(() => {
    if (metrics.length === 0) return [];

    // Group by date bucket
    const buckets = new Map<string, { views: number; likes: number; comments: number; posts: number }>();

    const sorted = [...metrics].sort(
      (a, b) => new Date(a.postedAt).getTime() - new Date(b.postedAt).getTime()
    );

    for (const m of sorted) {
      const d = new Date(m.postedAt);
      let key: string;

      if (range === "24h") {
        key = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
      } else if (range === "1y") {
        key = d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
      } else {
        key = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      }

      const existing = buckets.get(key) || { views: 0, likes: 0, comments: 0, posts: 0 };
      existing.views += m.views;
      existing.likes += m.likes;
      existing.comments += m.comments;
      existing.posts += 1;
      buckets.set(key, existing);
    }

    return Array.from(buckets.entries()).map(([date, data]) => ({
      date,
      views: data.views,
      likes: data.likes,
      comments: data.comments,
      engagement: data.views > 0 ? ((data.likes + data.comments) / data.views) * 100 : 0,
    }));
  }, [metrics, range]);

  const toggleMetric = (key: MetricKey) => {
    setActiveMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  if (chartData.length === 0) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center">
        <p className="text-white/30 text-sm">No trend data available for this period</p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_70px_rgba(2,6,23,0.45)] p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">
          Performance Trends
        </h3>
        <div className="flex gap-1.5">
          {(Object.keys(METRIC_CONFIG) as MetricKey[]).map((key) => (
            <button
              key={key}
              onClick={() => toggleMetric(key)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
                activeMetrics.has(key)
                  ? "bg-white/10 text-white"
                  : "text-white/25 hover:text-white/40"
              }`}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  background: METRIC_CONFIG[key].color,
                  opacity: activeMetrics.has(key) ? 1 : 0.3,
                }}
              />
              {METRIC_CONFIG[key].label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="viewsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="likesGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a855f7" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="commentsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="engagementGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis
              dataKey="date"
              tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }}
              axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) =>
                v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(v)
              }
            />
            <Tooltip content={<CustomTooltip />} />
            {activeMetrics.has("views") && (
              <Area
                type="monotone"
                dataKey="views"
                name="Views"
                stroke="#3b82f6"
                fill="url(#viewsGrad)"
                strokeWidth={2}
              />
            )}
            {activeMetrics.has("likes") && (
              <Area
                type="monotone"
                dataKey="likes"
                name="Likes"
                stroke="#a855f7"
                fill="url(#likesGrad)"
                strokeWidth={2}
              />
            )}
            {activeMetrics.has("comments") && (
              <Area
                type="monotone"
                dataKey="comments"
                name="Comments"
                stroke="#06b6d4"
                fill="url(#commentsGrad)"
                strokeWidth={2}
              />
            )}
            {activeMetrics.has("engagement") && (
              <Area
                type="monotone"
                dataKey="engagement"
                name="Engagement Rate"
                stroke="#10b981"
                fill="url(#engagementGrad)"
                strokeWidth={2}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
