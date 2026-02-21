"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/login/supabaseClient";

type Metric = {
  videoId: string;
  platform: "youtube" | "facebook" | "instagram";
  title: string;
  views: number;
  likes: number;
  comments: number;
  postedAt: string;
};

type Totals = { views: number; likes: number; comments: number };
type PlatformFilter = "all" | "youtube" | "facebook" | "instagram";
type RangeFilter = "24h" | "1w" | "1m" | "1y";

const platformLabels: Record<string, string> = {
  youtube: "YouTube",
  facebook: "Facebook",
  instagram: "Instagram",
};

function PlatformIcon({ platform }: { platform: string }) {
  if (platform === "youtube") {
    return (
      <svg className="w-5 h-5 text-red-500" viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814ZM9.545 15.568V8.432L15.818 12l-6.273 3.568Z" />
      </svg>
    );
  }
  if (platform === "facebook") {
    return (
      <svg className="w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073Z" />
      </svg>
    );
  }
  if (platform === "instagram") {
    return (
      <svg className="w-5 h-5 text-pink-500" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069ZM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0Zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881Z" />
      </svg>
    );
  }
  return null;
}

export default function AnalyticsPage() {
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [totals, setTotals] = useState<Totals>({ views: 0, likes: 0, comments: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<PlatformFilter>("all");
  const [range, setRange] = useState<RangeFilter>("1w");

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

  useEffect(() => {
    let cancelled = false;
    if (!authToken) return;

    async function loadMetrics() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/analytics/metrics?range=${encodeURIComponent(range)}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const json = await res.json();
        if (cancelled) return;

        if (json.ok) {
          setMetrics(json.metrics);
          setTotals(json.totals);
        } else {
          setError(json.error || "Failed to load metrics");
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

  const filteredTotals = filter === "all"
    ? totals
    : {
        views: filtered.reduce((s, m) => s + m.views, 0),
        likes: filtered.reduce((s, m) => s + m.likes, 0),
        comments: filtered.reduce((s, m) => s + m.comments, 0),
      };

  return (
    <main className="min-h-screen bg-[#050505] text-white relative overflow-hidden">
      {/* Background gradient orbs */}
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-blue-500/[0.07] via-purple-500/[0.04] to-transparent rounded-full blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 w-[500px] h-[500px] bg-gradient-to-t from-purple-500/[0.05] to-transparent rounded-full blur-3xl" />

      {/* Nav */}
      <nav className="relative z-10 border-b border-white/5">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="text-lg font-semibold tracking-tight">Clip Dash</Link>
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

      <div className="relative z-10 mx-auto max-w-6xl px-6 pt-10 pb-16">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Link href="/dashboard" className="text-white/30 hover:text-white/60 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </Link>
          <h1 className="text-2xl font-bold">Analytics</h1>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: "Total Views", value: filteredTotals.views },
            { label: "Total Likes", value: filteredTotals.likes },
            { label: "Total Comments", value: filteredTotals.comments },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_70px_rgba(2,6,23,0.45)] px-5 py-5 text-center"
            >
              <p className="text-xs text-white/40 uppercase tracking-wider">{stat.label}</p>
              <div className="flex items-center justify-center gap-2.5 mt-2">
                <p className="text-3xl font-bold tabular-nums text-white">
                  {loading ? (
                    <span className="inline-block w-10 h-8 rounded bg-white/[0.06] animate-pulse" />
                  ) : (
                    stat.value.toLocaleString()
                  )}
                </p>
                {!loading && (
                  <span className="flex items-center rounded-full bg-emerald-500/10 p-1.5 text-emerald-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
                    </svg>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Platform filter tabs */}
        <div className="flex flex-wrap gap-2 mb-3">
          {(["24h", "1w", "1m", "1y"] as RangeFilter[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                range === r
                  ? "bg-blue-500/20 text-blue-200 border border-blue-400/30"
                  : "text-white/40 hover:text-white/60 hover:bg-white/[0.04] border border-white/10"
              }`}
            >
              {r === "24h" ? "24 Hours" : r === "1w" ? "1 Week" : r === "1m" ? "1 Month" : "1 Year"}
            </button>
          ))}
        </div>

        <div className="flex gap-2 mb-6">
          {(["all", "youtube", "facebook", "instagram"] as PlatformFilter[]).map((p) => (
            <button
              key={p}
              onClick={() => setFilter(p)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filter === p
                  ? "bg-white/10 text-white"
                  : "text-white/40 hover:text-white/60 hover:bg-white/[0.04]"
              }`}
            >
              {p === "all" ? "All" : platformLabels[p]}
            </button>
          ))}
        </div>

        {/* Per-video table */}
        {loading ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 rounded-xl bg-white/[0.04] animate-pulse" />
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-red-500/20 bg-red-500/[0.05] p-6 text-center">
            <p className="text-red-400">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-10 text-center">
            <p className="text-white/40">No posted content yet. Metrics will appear here once your posts are published.</p>
          </div>
        ) : (
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_70px_rgba(2,6,23,0.45)] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left text-xs text-white/30 uppercase tracking-wider font-medium px-5 py-3">Title</th>
                  <th className="text-center text-xs text-white/30 uppercase tracking-wider font-medium px-3 py-3 w-14"></th>
                  <th className="text-right text-xs text-white/30 uppercase tracking-wider font-medium px-5 py-3">Views</th>
                  <th className="text-right text-xs text-white/30 uppercase tracking-wider font-medium px-5 py-3">Likes</th>
                  <th className="text-right text-xs text-white/30 uppercase tracking-wider font-medium px-5 py-3">Comments</th>
                  <th className="text-right text-xs text-white/30 uppercase tracking-wider font-medium px-5 py-3">Posted</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={`${m.platform}-${m.videoId}`} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3.5 text-sm text-white/80 max-w-[300px] truncate">{m.title}</td>
                    <td className="px-3 py-3.5 text-center">
                      <span className="inline-flex" title={platformLabels[m.platform]}>
                        <PlatformIcon platform={m.platform} />
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-white/70 text-right tabular-nums">{m.views.toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-sm text-white/70 text-right tabular-nums">{m.likes.toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-sm text-white/70 text-right tabular-nums">{m.comments.toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-sm text-white/40 text-right">
                      {new Date(m.postedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
