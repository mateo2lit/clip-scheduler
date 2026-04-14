"use client";

import { useMemo, useState } from "react";

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

type HashtagStat = {
  tag: string;
  uses: number;
  avgViews: number;
  avgLikes: number;
  avgEngagement: number;
};

export default function HashtagPerformance({ metrics }: { metrics: Metric[] }) {
  const [showAll, setShowAll] = useState(false);

  const hashtags = useMemo(() => {
    const tagMap = new Map<string, { views: number; likes: number; comments: number; count: number }>();

    for (const m of metrics) {
      // Extract hashtags from title and description-like fields
      const text = `${m.title} `;
      const tags = text.match(/#[\w\u00C0-\u024F]+/g);
      if (!tags) continue;

      for (const rawTag of tags) {
        const tag = rawTag.toLowerCase();
        const existing = tagMap.get(tag) || { views: 0, likes: 0, comments: 0, count: 0 };
        existing.views += m.views;
        existing.likes += m.likes;
        existing.comments += m.comments;
        existing.count += 1;
        tagMap.set(tag, existing);
      }
    }

    return Array.from(tagMap.entries())
      .map(([tag, d]): HashtagStat => ({
        tag,
        uses: d.count,
        avgViews: Math.round(d.views / d.count),
        avgLikes: Math.round(d.likes / d.count),
        avgEngagement: Math.round((d.views + d.likes + d.comments) / d.count),
      }))
      .sort((a, b) => b.avgEngagement - a.avgEngagement);
  }, [metrics]);

  if (hashtags.length === 0) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_70px_rgba(2,6,23,0.45)] p-6">
        <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-3">
          Hashtag Performance
        </h3>
        <p className="text-sm text-white/25">
          Add hashtags to your post titles to track their performance here
        </p>
      </div>
    );
  }

  const displayed = showAll ? hashtags : hashtags.slice(0, 8);
  const maxEngagement = hashtags[0]?.avgEngagement || 1;

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_70px_rgba(2,6,23,0.45)] p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">
          Hashtag Performance
        </h3>
        <span className="text-xs text-white/25">{hashtags.length} tags tracked</span>
      </div>

      <div className="space-y-2">
        {displayed.map((h, idx) => {
          const barWidth = (h.avgEngagement / maxEngagement) * 100;
          return (
            <div key={h.tag} className="group">
              <div className="flex items-center gap-3">
                <span className="text-xs text-white/20 font-mono w-4 tabular-nums shrink-0">
                  {idx + 1}
                </span>
                <span className="text-sm font-medium text-cyan-300/80 w-32 truncate shrink-0">
                  {h.tag}
                </span>
                <div className="flex-1 h-6 rounded-lg bg-white/[0.03] overflow-hidden relative">
                  <div
                    className="h-full rounded-lg bg-gradient-to-r from-cyan-500/30 to-cyan-500/10 transition-all"
                    style={{ width: `${barWidth}%` }}
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-white/30 tabular-nums">
                    avg {h.avgEngagement.toLocaleString()}
                  </span>
                </div>
                <span className="text-[10px] text-white/25 w-12 text-right shrink-0 tabular-nums">
                  {h.uses}x used
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {hashtags.length > 8 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full mt-3 py-2 text-sm text-white/30 hover:text-white/50 transition-colors"
        >
          {showAll ? "Show less" : `Show all ${hashtags.length} hashtags`}
        </button>
      )}
    </div>
  );
}
