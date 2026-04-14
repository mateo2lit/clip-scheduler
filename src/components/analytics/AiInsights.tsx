"use client";

import { useEffect, useState, useRef } from "react";

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

type Totals = { views: number; likes: number; comments: number; shares: number };

export default function AiInsights({
  metrics,
  totals,
  prevTotals,
  range,
  authToken,
}: {
  metrics: Metric[];
  totals: Totals;
  prevTotals: Totals;
  range: string;
  authToken: string;
}) {
  const [insights, setInsights] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<{ key: string; insights: string[]; ts: number } | null>(null);

  useEffect(() => {
    if (metrics.length === 0 || !authToken) return;

    // Cache key based on metrics count + range + totals
    const cacheKey = `${metrics.length}-${range}-${totals.views}-${totals.likes}`;
    const now = Date.now();

    // Use cache if less than 1 hour old
    if (cacheRef.current && cacheRef.current.key === cacheKey && now - cacheRef.current.ts < 3600000) {
      setInsights(cacheRef.current.insights);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch("/api/ai/insights", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        metrics: metrics.slice(0, 20),
        totals,
        prevTotals,
        range,
        platforms: [...new Set(metrics.map((m) => m.platform))],
      }),
    })
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.ok && json.insights) {
          setInsights(json.insights);
          cacheRef.current = { key: cacheKey, insights: json.insights, ts: Date.now() };
        } else {
          setError(json.error || "Failed to generate insights");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Failed to generate insights");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [metrics, totals, prevTotals, range, authToken]);

  if (metrics.length === 0) return null;

  return (
    <div className="rounded-2xl border border-purple-500/20 bg-purple-500/[0.04] shadow-[0_20px_70px_rgba(2,6,23,0.45)] px-6 py-5">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-7 h-7 rounded-lg bg-purple-500/20 flex items-center justify-center">
          <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-purple-300">AI Insights</h3>
        {loading && (
          <span className="text-[10px] text-purple-400/50 animate-pulse ml-auto">Analyzing...</span>
        )}
      </div>

      {loading && insights.length === 0 ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-5 rounded-lg bg-purple-500/[0.06] animate-pulse" style={{ width: `${70 + i * 8}%` }} />
          ))}
        </div>
      ) : error ? (
        <p className="text-xs text-white/30">{error}</p>
      ) : (
        <ul className="space-y-2">
          {insights.map((insight, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm text-white/70 leading-relaxed">
              <span className="shrink-0 mt-1 w-1.5 h-1.5 rounded-full bg-purple-400/60" />
              {insight}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
