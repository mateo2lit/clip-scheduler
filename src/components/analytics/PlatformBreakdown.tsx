"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
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

const PLATFORM_COLORS: Record<string, string> = {
  youtube: "#ef4444",
  tiktok: "#e879f9",
  instagram: "#ec4899",
  facebook: "#3b82f6",
  bluesky: "#38bdf8",
  x: "#a3a3a3",
};

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  bluesky: "Bluesky",
  x: "X",
};

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border border-white/10 bg-[#0a0a0a]/95 backdrop-blur-sm px-4 py-3 shadow-xl">
      <p className="text-xs font-semibold text-white mb-2">{d.label}</p>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between gap-6">
          <span className="text-white/50">Posts</span>
          <span className="text-white font-medium tabular-nums">{d.posts}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-white/50">Views</span>
          <span className="text-white font-medium tabular-nums">{d.views.toLocaleString()}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-white/50">Likes</span>
          <span className="text-white font-medium tabular-nums">{d.likes.toLocaleString()}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-white/50">Engagement</span>
          <span className="text-white font-medium tabular-nums">{d.engagementRate}%</span>
        </div>
      </div>
    </div>
  );
}

export default function PlatformBreakdown({ metrics }: { metrics: Metric[] }) {
  const data = useMemo(() => {
    const byPlatform = new Map<
      string,
      { views: number; likes: number; comments: number; posts: number }
    >();

    for (const m of metrics) {
      const existing = byPlatform.get(m.platform) || {
        views: 0,
        likes: 0,
        comments: 0,
        posts: 0,
      };
      existing.views += m.views;
      existing.likes += m.likes;
      existing.comments += m.comments;
      existing.posts += 1;
      byPlatform.set(m.platform, existing);
    }

    return Array.from(byPlatform.entries())
      .map(([platform, d]) => ({
        platform,
        label: PLATFORM_LABELS[platform] || platform,
        color: PLATFORM_COLORS[platform] || "#6b7280",
        ...d,
        engagement: d.likes + d.comments,
        engagementRate: d.views > 0 ? ((d.likes + d.comments) / d.views * 100).toFixed(1) : "0.0",
      }))
      .sort((a, b) => b.engagement - a.engagement);
  }, [metrics]);

  if (data.length === 0) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-center">
        <p className="text-white/30 text-sm">No platform data</p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_70px_rgba(2,6,23,0.45)] p-6">
      <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-5">
        Platform Breakdown
      </h3>

      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }} barSize={32}>
            <XAxis
              dataKey="label"
              tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "rgba(255,255,255,0.25)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) =>
                v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
              }
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
            <Bar dataKey="engagement" radius={[6, 6, 0, 0]}>
              {data.map((entry) => (
                <Cell key={entry.platform} fill={entry.color} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Platform stats grid */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        {data.map((d) => (
          <div
            key={d.platform}
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 bg-white/[0.02]"
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: d.color }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white/60 truncate">{d.label}</p>
            </div>
            <p className="text-xs font-semibold text-white/80 tabular-nums">
              {d.posts} {d.posts === 1 ? "post" : "posts"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
