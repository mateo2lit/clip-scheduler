"use client";

import { useMemo, useState } from "react";
import { CaretDown } from "@phosphor-icons/react/dist/ssr";

type Metric = {
  videoId: string;
  platform: string;
  title: string;
  views: number;
  likes: number;
  comments: number;
  shares?: number;
  thumbnailUrl?: string | null;
  postedAt: string;
};

type SortKey = "views" | "likes" | "comments" | "engagement" | "date";

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  bluesky: "Bluesky",
  x: "X",
};

const PLATFORM_COLORS: Record<string, string> = {
  youtube: "bg-red-500/20 text-red-300",
  tiktok: "bg-fuchsia-500/20 text-fuchsia-300",
  instagram: "bg-pink-500/20 text-pink-300",
  facebook: "bg-blue-500/20 text-blue-300",
  bluesky: "bg-sky-500/20 text-sky-300",
  x: "bg-neutral-500/20 text-neutral-300",
};

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 10_000) return (n / 1_000).toFixed(0) + "K";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

export default function TopPosts({ metrics }: { metrics: Metric[] }) {
  const [sortBy, setSortBy] = useState<SortKey>("engagement");
  const [sortAsc, setSortAsc] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const sorted = useMemo(() => {
    const withEngagement = metrics.map((m) => ({
      ...m,
      engagement: m.views + m.likes + m.comments + (m.shares ?? 0),
      engagementRate:
        m.views > 0
          ? ((m.likes + m.comments) / m.views) * 100
          : 0,
    }));

    return withEngagement.sort((a, b) => {
      let diff = 0;
      switch (sortBy) {
        case "views":
          diff = a.views - b.views;
          break;
        case "likes":
          diff = a.likes - b.likes;
          break;
        case "comments":
          diff = a.comments - b.comments;
          break;
        case "engagement":
          diff = a.engagement - b.engagement;
          break;
        case "date":
          diff = new Date(a.postedAt).getTime() - new Date(b.postedAt).getTime();
          break;
      }
      return sortAsc ? diff : -diff;
    });
  }, [metrics, sortBy, sortAsc]);

  const displayed = showAll ? sorted : sorted.slice(0, 10);

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(key);
      setSortAsc(false);
    }
  };

  const SortHeader = ({
    label,
    sortKey,
    className = "",
  }: {
    label: string;
    sortKey: SortKey;
    className?: string;
  }) => (
    <button
      onClick={() => handleSort(sortKey)}
      className={`flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold transition-colors ${
        sortBy === sortKey ? "text-white/70" : "text-white/30 hover:text-white/50"
      } ${className}`}
    >
      {label}
      {sortBy === sortKey && (
        <CaretDown
          className={`w-3 h-3 transition-transform ${sortAsc ? "rotate-180" : ""}`}
          weight="bold"
        />
      )}
    </button>
  );

  if (metrics.length === 0) return null;

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_70px_rgba(2,6,23,0.45)] p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">
          Top Performing Posts
        </h3>
        <span className="text-xs text-white/25">{metrics.length} posts</span>
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[1fr_80px_70px_70px_80px_90px] gap-2 px-3 py-2 border-b border-white/[0.06] mb-1">
        <SortHeader label="Post" sortKey="date" />
        <SortHeader label="Views" sortKey="views" className="justify-end" />
        <SortHeader label="Likes" sortKey="likes" className="justify-end" />
        <SortHeader label="Comments" sortKey="comments" className="justify-end" />
        <SortHeader label="Eng. Rate" sortKey="engagement" className="justify-end" />
        <span className="text-[10px] text-white/25 uppercase tracking-wider text-right">
          Date
        </span>
      </div>

      {/* Table rows */}
      <div className="space-y-0.5">
        {displayed.map((m, idx) => (
          <div
            key={`${m.platform}-${m.videoId}`}
            className="grid grid-cols-[1fr_80px_70px_70px_80px_90px] gap-2 items-center px-3 py-2.5 rounded-xl transition-colors hover:bg-white/[0.03] group"
          >
            {/* Post info */}
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-xs text-white/15 font-mono w-5 shrink-0 tabular-nums">
                {idx + 1}
              </span>
              {m.thumbnailUrl ? (
                <img
                  src={m.thumbnailUrl}
                  alt=""
                  className="w-9 h-9 rounded-lg object-cover shrink-0 bg-white/[0.04]"
                />
              ) : (
                <div className="w-9 h-9 rounded-lg bg-white/[0.04] shrink-0" />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm text-white/80 font-medium">{m.title}</p>
                <span
                  className={`inline-block mt-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    PLATFORM_COLORS[m.platform] || "bg-white/10 text-white/50"
                  }`}
                >
                  {PLATFORM_LABELS[m.platform] || m.platform}
                </span>
              </div>
            </div>

            {/* Metrics */}
            <p className="text-sm text-right text-white/70 font-medium tabular-nums">
              {m.views > 0 ? formatNum(m.views) : "--"}
            </p>
            <p className="text-sm text-right text-white/70 font-medium tabular-nums">
              {formatNum(m.likes)}
            </p>
            <p className="text-sm text-right text-white/70 font-medium tabular-nums">
              {formatNum(m.comments)}
            </p>
            <p className="text-sm text-right font-medium tabular-nums">
              {m.engagementRate > 0 ? (
                <span className="text-emerald-400">
                  {m.engagementRate.toFixed(1)}%
                </span>
              ) : (
                <span className="text-white/25">--</span>
              )}
            </p>
            <p className="text-xs text-right text-white/30">
              {new Date(m.postedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </p>
          </div>
        ))}
      </div>

      {/* Show more */}
      {sorted.length > 10 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full mt-3 py-2 text-sm text-white/40 hover:text-white/60 transition-colors"
        >
          {showAll ? "Show less" : `Show all ${sorted.length} posts`}
        </button>
      )}
    </div>
  );
}
