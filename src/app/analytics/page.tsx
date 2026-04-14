"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/app/login/supabaseClient";
import AppPageOrb from "@/components/AppPageOrb";
import EngagementChart from "@/components/analytics/EngagementChart";
import PlatformBreakdown from "@/components/analytics/PlatformBreakdown";
import BestTimeHeatmap from "@/components/analytics/BestTimeHeatmap";
import TopPosts from "@/components/analytics/TopPosts";
import AiInsights from "@/components/analytics/AiInsights";
import ContentTypeChart from "@/components/analytics/ContentTypeChart";
import HashtagPerformance from "@/components/analytics/HashtagPerformance";
import FollowerGrowth from "@/components/analytics/FollowerGrowth";
import ExportReport from "@/components/analytics/ExportReport";

type Metric = {
  videoId: string;
  platform: "youtube" | "facebook" | "instagram" | "bluesky" | "tiktok" | "x";
  title: string;
  views: number;
  likes: number;
  comments: number;
  shares?: number;
  thumbnailUrl?: string | null;
  postedAt: string;
};

type Totals = { views: number; likes: number; comments: number; shares: number };
type PlatformFilter = "all" | "youtube" | "facebook" | "instagram" | "bluesky" | "tiktok" | "x";
type RangeFilter = "24h" | "1w" | "1m" | "1y";

const platformLabels: Record<string, string> = {
  youtube: "YouTube",
  facebook: "Facebook",
  instagram: "Instagram",
  bluesky: "Bluesky",
  tiktok: "TikTok",
  x: "X (Twitter)",
};

const PLATFORM_STATS: Record<string, { views: boolean; likes: boolean; comments: boolean; shares: boolean }> = {
  youtube:   { views: true,  likes: true, comments: true,  shares: false },
  tiktok:    { views: true,  likes: true, comments: true,  shares: true  },
  instagram: { views: false, likes: true, comments: true,  shares: false },
  facebook:  { views: false, likes: true, comments: true,  shares: false },
  bluesky:   { views: false, likes: true, comments: true,  shares: false },
  x:         { views: true,  likes: true, comments: true,  shares: true  },
};

function formatStat(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 10_000) return (n / 1_000).toFixed(0) + "K";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

function KpiCard({
  label,
  value,
  prevValue,
  loading,
  suffix = "",
  icon,
}: {
  label: string;
  value: number;
  prevValue?: number;
  loading: boolean;
  suffix?: string;
  icon: React.ReactNode;
}) {
  const change = prevValue !== undefined && prevValue > 0
    ? ((value - prevValue) / prevValue) * 100
    : null;

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] shadow-[0_20px_70px_rgba(2,6,23,0.45)] px-5 py-4 relative overflow-hidden group hover:border-white/[0.12] transition-colors">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] text-white/35 uppercase tracking-wider font-medium">{label}</p>
          <div className="mt-1.5">
            {loading ? (
              <span className="inline-block w-16 h-8 rounded-lg bg-white/[0.06] animate-pulse" />
            ) : (
              <p className="text-2xl font-bold text-white tabular-nums">
                {formatStat(value)}{suffix}
              </p>
            )}
          </div>
        </div>
        <div className="w-9 h-9 rounded-xl bg-white/[0.04] flex items-center justify-center text-white/20 group-hover:text-white/30 transition-colors">
          {icon}
        </div>
      </div>
      {!loading && change !== null && (
        <div className="mt-2 flex items-center gap-1">
          <span
            className={`flex items-center gap-0.5 text-xs font-medium ${
              change >= 0 ? "text-emerald-400" : "text-red-400"
            }`}
          >
            <svg
              className={`w-3 h-3 ${change < 0 ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
            </svg>
            {Math.abs(change).toFixed(1)}%
          </span>
          <span className="text-[10px] text-white/20">vs prev period</span>
        </div>
      )}
    </div>
  );
}

function PlatformPill({
  platform,
  label,
  active,
  onClick,
}: {
  platform: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  const colorMap: Record<string, string> = {
    youtube: "border-red-500/40 bg-red-500/10 text-red-300",
    tiktok: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300",
    instagram: "border-pink-500/40 bg-pink-500/10 text-pink-300",
    facebook: "border-blue-500/40 bg-blue-500/10 text-blue-300",
    bluesky: "border-sky-400/40 bg-sky-400/10 text-sky-300",
    x: "border-neutral-400/40 bg-neutral-400/10 text-neutral-300",
  };

  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
        active
          ? platform === "all"
            ? "bg-white/10 text-white border-white/20"
            : colorMap[platform] || "bg-white/10 text-white border-white/20"
          : "text-white/35 hover:text-white/50 hover:bg-white/[0.03] border-transparent"
      }`}
    >
      {label}
    </button>
  );
}

export default function AnalyticsPage() {
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [prevMetrics, setPrevMetrics] = useState<Metric[]>([]);
  const [totals, setTotals] = useState<Totals>({ views: 0, likes: 0, comments: 0, shares: 0 });
  const [prevTotals, setPrevTotals] = useState<Totals>({ views: 0, likes: 0, comments: 0, shares: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<PlatformFilter>("all");
  const [range, setRange] = useState<RangeFilter>("1w");
  const [activeTab, setActiveTab] = useState<"overview" | "posts">("overview");

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) {
        window.location.href = "/login";
        return;
      }

      if (cancelled) return;
      setSessionEmail(auth.session.user.email ?? null);
      setAuthToken(auth.session.access_token);
    }

    boot();
    return () => { cancelled = true; };
  }, []);

  // Map range to its "previous period" equivalent for comparison
  const prevRange: Record<string, string> = {
    "24h": "24h",
    "1w": "1w",
    "1m": "1m",
    "1y": "1y",
  };

  useEffect(() => {
    let cancelled = false;
    if (!authToken) return;

    async function loadMetrics() {
      setLoading(true);
      setError(null);
      try {
        // Fetch current and previous period in parallel
        const [currentRes, prevRes] = await Promise.all([
          fetch(`/api/analytics/metrics?range=${encodeURIComponent(range)}`, {
            headers: { Authorization: `Bearer ${authToken}` },
          }),
          fetch(`/api/analytics/metrics?range=${encodeURIComponent("2m")}`, {
            headers: { Authorization: `Bearer ${authToken}` },
          }),
        ]);

        const currentJson = await currentRes.json();
        const prevJson = await prevRes.json();

        if (cancelled) return;

        if (currentJson.ok) {
          setMetrics(currentJson.metrics);
          setTotals(currentJson.totals);
        } else {
          setError(currentJson.error || "Failed to load metrics");
        }

        if (prevJson.ok) {
          // Filter prev metrics to only include the previous period (not current)
          const rangeMs: Record<string, number> = {
            "24h": 24 * 60 * 60 * 1000,
            "1w": 7 * 24 * 60 * 60 * 1000,
            "1m": 30 * 24 * 60 * 60 * 1000,
            "1y": 365 * 24 * 60 * 60 * 1000,
          };
          const windowMs = rangeMs[range] ?? rangeMs["1w"];
          const cutoff = Date.now() - windowMs;
          const prevOnly = (prevJson.metrics as Metric[]).filter(
            (m) => new Date(m.postedAt).getTime() < cutoff
          );
          setPrevMetrics(prevOnly);
          setPrevTotals({
            views: prevOnly.reduce((s, m) => s + m.views, 0),
            likes: prevOnly.reduce((s, m) => s + m.likes, 0),
            comments: prevOnly.reduce((s, m) => s + m.comments, 0),
            shares: prevOnly.reduce((s, m) => s + (m.shares ?? 0), 0),
          });
        }
      } catch {
        if (!cancelled) setError("Failed to load metrics");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadMetrics();
    return () => { cancelled = true; };
  }, [authToken, range]);

  const filtered = filter === "all" ? metrics : metrics.filter((m) => m.platform === filter);
  const filteredPrev = filter === "all" ? prevMetrics : prevMetrics.filter((m) => m.platform === filter);

  const filteredTotals = filter === "all"
    ? totals
    : {
        views: filtered.reduce((s, m) => s + m.views, 0),
        likes: filtered.reduce((s, m) => s + m.likes, 0),
        comments: filtered.reduce((s, m) => s + m.comments, 0),
        shares: filtered.reduce((s, m) => s + (m.shares ?? 0), 0),
      };

  const filteredPrevTotals = filter === "all"
    ? prevTotals
    : {
        views: filteredPrev.reduce((s, m) => s + m.views, 0),
        likes: filteredPrev.reduce((s, m) => s + m.likes, 0),
        comments: filteredPrev.reduce((s, m) => s + m.comments, 0),
        shares: filteredPrev.reduce((s, m) => s + (m.shares ?? 0), 0),
      };

  const engagementRate = filteredTotals.views > 0
    ? ((filteredTotals.likes + filteredTotals.comments) / filteredTotals.views) * 100
    : 0;

  const prevEngagementRate = filteredPrevTotals.views > 0
    ? ((filteredPrevTotals.likes + filteredPrevTotals.comments) / filteredPrevTotals.views) * 100
    : 0;

  const hasTikTok = filter === "tiktok" || (filter === "all" && metrics.some((m) => m.platform === "tiktok"));
  const platformSupport = filter === "all" ? null : (PLATFORM_STATS[filter] ?? null);
  const showViews = !platformSupport || platformSupport.views;
  const showShares = hasTikTok && (!platformSupport || platformSupport.shares);

  return (
    <main className="min-h-screen bg-[#050505] text-white relative overflow-hidden">
      <AppPageOrb />

      {/* Nav */}
      <nav className="relative z-10 border-b border-white/5">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <img src="/logo.svg" alt="Clip Dash" className="h-10 w-auto" />
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/settings" className="text-sm text-white/40 hover:text-white/70 transition-colors">
              Settings
            </Link>
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-[11px] font-semibold">
              {sessionEmail ? sessionEmail[0].toUpperCase() : "?"}
            </div>
          </div>
        </div>
      </nav>

      <div className="relative z-10 mx-auto max-w-7xl px-6 pt-8 pb-16">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-white/30 hover:text-white/60 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </Link>
            <h1 className="text-2xl font-bold">Analytics</h1>
          </div>

          <div className="flex items-center gap-3">
          {/* Export buttons */}
          {!loading && <ExportReport metrics={filtered} totals={filteredTotals} range={range} />}

          {/* View tabs */}
          <div className="flex rounded-xl border border-white/[0.07] bg-white/[0.02] p-0.5">
            <button
              onClick={() => setActiveTab("overview")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === "overview"
                  ? "bg-white/10 text-white"
                  : "text-white/35 hover:text-white/50"
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab("posts")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === "posts"
                  ? "bg-white/10 text-white"
                  : "text-white/35 hover:text-white/50"
              }`}
            >
              Posts
            </button>
          </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          {/* Time range */}
          <div className="flex rounded-xl border border-white/[0.07] bg-white/[0.02] p-0.5">
            {(["24h", "1w", "1m", "1y"] as RangeFilter[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  range === r
                    ? "bg-blue-500/20 text-blue-200"
                    : "text-white/30 hover:text-white/50"
                }`}
              >
                {r === "24h" ? "24h" : r === "1w" ? "7d" : r === "1m" ? "30d" : "1y"}
              </button>
            ))}
          </div>

          <div className="w-px h-6 bg-white/[0.06]" />

          {/* Platform filters */}
          <div className="flex flex-wrap gap-1.5">
            {(["all", "youtube", "tiktok", "instagram", "facebook", "bluesky", "x"] as PlatformFilter[]).map((p) => (
              <PlatformPill
                key={p}
                platform={p}
                label={p === "all" ? "All Platforms" : platformLabels[p]}
                active={filter === p}
                onClick={() => setFilter(p)}
              />
            ))}
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.05] p-4 mb-6">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* KPI Cards */}
        <div className={`grid gap-3 mb-6 ${showShares ? "grid-cols-2 lg:grid-cols-5" : showViews ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2 lg:grid-cols-3"}`}>
          {showViews && (
            <KpiCard
              label="Views"
              value={filteredTotals.views}
              prevValue={filteredPrevTotals.views}
              loading={loading}
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              }
            />
          )}
          <KpiCard
            label="Likes"
            value={filteredTotals.likes}
            prevValue={filteredPrevTotals.likes}
            loading={loading}
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
              </svg>
            }
          />
          <KpiCard
            label="Comments"
            value={filteredTotals.comments}
            prevValue={filteredPrevTotals.comments}
            loading={loading}
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
              </svg>
            }
          />
          {showShares && (
            <KpiCard
              label="Shares"
              value={filteredTotals.shares}
              prevValue={filteredPrevTotals.shares}
              loading={loading}
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                </svg>
              }
            />
          )}
          <KpiCard
            label="Eng. Rate"
            value={engagementRate}
            prevValue={prevEngagementRate > 0 ? prevEngagementRate : undefined}
            loading={loading}
            suffix="%"
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
              </svg>
            }
          />
        </div>

        {/* Content based on active tab */}
        {activeTab === "overview" ? (
          <div className="space-y-6">
            {/* AI Insights */}
            {!loading && authToken && (
              <AiInsights
                metrics={filtered}
                totals={filteredTotals}
                prevTotals={filteredPrevTotals}
                range={range}
                authToken={authToken}
              />
            )}

            {/* Follower growth */}
            {!loading && authToken && (
              <FollowerGrowth authToken={authToken} range={range} />
            )}

            {/* Trend chart */}
            {!loading && (
              <EngagementChart metrics={filtered} range={range} />
            )}

            {/* Three-column: Platform breakdown + Content mix + Best time heatmap */}
            {!loading && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <PlatformBreakdown metrics={filtered} />
                <ContentTypeChart metrics={filtered} />
                <BestTimeHeatmap metrics={filtered} />
              </div>
            )}

            {/* Hashtag performance */}
            {!loading && (
              <HashtagPerformance metrics={filtered} />
            )}

            {/* Top posts preview */}
            {!loading && filtered.length > 0 && (
              <TopPosts metrics={filtered} />
            )}
          </div>
        ) : (
          /* Posts tab - detailed post list */
          <div>
            {loading ? (
              <div className="space-y-2">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-16 rounded-2xl border border-white/[0.06] bg-white/[0.02] animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-10 text-center">
                <p className="text-white/40">No posted content yet. Metrics will appear here once your posts are published.</p>
              </div>
            ) : (
              <TopPosts metrics={filtered} />
            )}
          </div>
        )}

        {/* Loading overlay for charts */}
        {loading && activeTab === "overview" && (
          <div className="space-y-6 mt-6">
            <div className="h-[360px] rounded-3xl border border-white/[0.06] bg-white/[0.02] animate-pulse" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="h-[360px] rounded-3xl border border-white/[0.06] bg-white/[0.02] animate-pulse" />
              <div className="h-[360px] rounded-3xl border border-white/[0.06] bg-white/[0.02] animate-pulse" />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
