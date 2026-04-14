"use client";

import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

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

const PLATFORM_COLORS: Record<string, string> = {
  youtube: "#ef4444",
  tiktok: "#d946ef",
  instagram: "#ec4899",
  facebook: "#3b82f6",
  bluesky: "#38bdf8",
  x: "#a3a3a3",
  linkedin: "#0a66c2",
};

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  bluesky: "Bluesky",
  x: "X",
  linkedin: "LinkedIn",
};

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border border-white/10 bg-[#0a0a0a]/95 backdrop-blur-sm px-4 py-3 shadow-xl">
      <p className="text-xs font-semibold text-white mb-1">{d.label}</p>
      <div className="space-y-0.5 text-xs">
        <p className="text-white/50">{d.posts} posts ({d.pct}%)</p>
        <p className="text-white/50">Avg engagement: {d.avgEngagement.toLocaleString()}</p>
      </div>
    </div>
  );
}

export default function ContentTypeChart({ metrics }: { metrics: Metric[] }) {
  const data = useMemo(() => {
    const byPlatform = new Map<string, { posts: number; engagement: number }>();

    for (const m of metrics) {
      const existing = byPlatform.get(m.platform) || { posts: 0, engagement: 0 };
      existing.posts += 1;
      existing.engagement += m.views + m.likes + m.comments;
      byPlatform.set(m.platform, existing);
    }

    const total = metrics.length;

    return Array.from(byPlatform.entries())
      .map(([platform, d]) => ({
        platform,
        label: PLATFORM_LABELS[platform] || platform,
        color: PLATFORM_COLORS[platform] || "#6b7280",
        posts: d.posts,
        pct: total > 0 ? Math.round((d.posts / total) * 100) : 0,
        avgEngagement: d.posts > 0 ? Math.round(d.engagement / d.posts) : 0,
      }))
      .sort((a, b) => b.posts - a.posts);
  }, [metrics]);

  if (data.length === 0) return null;

  // Find best performing platform by avg engagement
  const bestPlatform = data.reduce((best, d) => (d.avgEngagement > best.avgEngagement ? d : best), data[0]);

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_70px_rgba(2,6,23,0.45)] p-6">
      <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-4">
        Content Mix
      </h3>

      <div className="flex items-center gap-6">
        {/* Donut chart */}
        <div className="w-[140px] h-[140px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={65}
                paddingAngle={2}
                dataKey="posts"
                stroke="none"
              >
                {data.map((d) => (
                  <Cell key={d.platform} fill={d.color} fillOpacity={0.85} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend + stats */}
        <div className="flex-1 space-y-2">
          {data.map((d) => (
            <div key={d.platform} className="flex items-center gap-2.5">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: d.color }}
              />
              <span className="text-xs text-white/60 flex-1">{d.label}</span>
              <span className="text-xs text-white/40 tabular-nums">{d.pct}%</span>
              <span className="text-xs text-white/25 tabular-nums w-16 text-right">
                avg {d.avgEngagement.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Best platform callout */}
      {data.length > 1 && (
        <div className="mt-4 px-3 py-2 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/10">
          <p className="text-xs text-emerald-400/80">
            <span className="font-medium">{bestPlatform.label}</span> has your highest avg
            engagement at{" "}
            <span className="font-medium tabular-nums">
              {bestPlatform.avgEngagement.toLocaleString()}
            </span>{" "}
            per post
          </p>
        </div>
      )}
    </div>
  );
}
