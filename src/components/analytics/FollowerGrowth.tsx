"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const PLATFORM_COLORS: Record<string, string> = {
  youtube: "#ef4444",
  tiktok: "#d946ef",
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

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#0a0a0a]/95 backdrop-blur-sm px-4 py-3 shadow-xl">
      <p className="text-xs text-white/50 mb-2 font-medium">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-white/60">{PLATFORM_LABELS[entry.dataKey] || entry.dataKey}:</span>
          <span className="font-semibold text-white tabular-nums">
            {formatFollowers(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function FollowerGrowth({
  authToken,
  range,
}: {
  authToken: string;
  range: string;
}) {
  const [data, setData] = useState<any[]>([]);
  const [latestTotals, setLatestTotals] = useState<Record<string, number>>({});
  const [totalFollowers, setTotalFollowers] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authToken) return;
    let cancelled = false;

    setLoading(true);
    fetch(`/api/analytics/followers?range=${encodeURIComponent(range)}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.ok) {
          // Format dates for display
          const formatted = (json.chartData || []).map((d: any) => ({
            ...d,
            date: new Date(d.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
          }));
          setData(formatted);
          setLatestTotals(json.latestTotals || {});
          setTotalFollowers(json.totalFollowers || 0);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [authToken, range]);

  const platforms = Object.keys(latestTotals);

  if (loading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_70px_rgba(2,6,23,0.45)] p-6">
        <div className="h-[260px] animate-pulse rounded-xl bg-white/[0.03]" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_70px_rgba(2,6,23,0.45)] p-6">
        <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-3">
          Follower Growth
        </h3>
        <p className="text-sm text-white/25">
          Follower data will appear here once daily snapshots begin collecting
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_70px_rgba(2,6,23,0.45)] p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">
          Follower Growth
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold text-white tabular-nums">
            {formatFollowers(totalFollowers)}
          </span>
          <span className="text-xs text-white/30">total followers</span>
        </div>
      </div>

      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
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
              tickFormatter={formatFollowers}
            />
            <Tooltip content={<CustomTooltip />} />
            {platforms.map((platform) => (
              <Line
                key={platform}
                type="monotone"
                dataKey={platform}
                stroke={PLATFORM_COLORS[platform] || "#6b7280"}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Platform follower counts */}
      <div className="mt-4 flex flex-wrap gap-4">
        {platforms.map((p) => (
          <div key={p} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: PLATFORM_COLORS[p] || "#6b7280" }} />
            <span className="text-xs text-white/50">{PLATFORM_LABELS[p] || p}</span>
            <span className="text-xs font-semibold text-white/80 tabular-nums">
              {formatFollowers(latestTotals[p])}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
