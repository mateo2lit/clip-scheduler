"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/login/supabaseClient";
import AppPageOrb from "@/components/AppPageOrb";

type PostCounts = {
  scheduled: number;
  posted: number;
  drafts: number;
};

type AnalyticsTotals = {
  views: number;
  likes: number;
  prevViews: number;
  prevLikes: number;
};

function formatStat(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

export default function DashboardPage() {
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [counts, setCounts] = useState<PostCounts>({ scheduled: 0, posted: 0, drafts: 0 });
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState<AnalyticsTotals | null>(null);
  const [totalsLoading, setTotalsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setLoading(true);

      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) {
        window.location.href = "/login";
        return;
      }

      if (cancelled) return;
      setSessionEmail(auth.session.user.email ?? null);

      const token = auth.session.access_token;

      // Redirect to onboarding if not yet completed (enforces paywall)
      try {
        const onbRes = await fetch("/api/onboarding", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const onbJson = await onbRes.json().catch(() => ({}));
        if (!onbJson.completed) {
          window.location.href = "/onboarding";
          return;
        }
      } catch {}
      let teamId: string | null = null;
      try {
        const res = await fetch("/api/team/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (json.ok) teamId = json.teamId;
      } catch {}

      if (!teamId || cancelled) {
        setLoading(false);
        setTotalsLoading(false);
        return;
      }

      // Post counts — fast
      const [scheduledRes, postedRes, draftsRes] = await Promise.all([
        supabase
          .from("scheduled_posts")
          .select("id", { count: "exact", head: true })
          .eq("team_id", teamId)
          .eq("status", "scheduled"),
        supabase
          .from("scheduled_posts")
          .select("id", { count: "exact", head: true })
          .eq("team_id", teamId)
          .eq("status", "posted"),
        supabase
          .from("scheduled_posts")
          .select("id", { count: "exact", head: true })
          .eq("team_id", teamId)
          .eq("status", "draft"),
      ]);

      if (cancelled) return;

      setCounts({
        scheduled: scheduledRes.count ?? 0,
        posted: postedRes.count ?? 0,
        drafts: draftsRes.count ?? 0,
      });
      setLoading(false);

      // Analytics totals — slow (external API calls), loads separately
      // Use localStorage as a stale-while-revalidate cache keyed by teamId
      const cacheKey = `dashboard_stats_v2_${teamId}`;
      const cacheTtl = 15 * 60 * 1000; // 15 min
      let cacheHit = false;
      try {
        const raw = localStorage.getItem(cacheKey);
        if (raw) {
          const cached = JSON.parse(raw) as { views: number; likes: number; prevViews: number; prevLikes: number; cachedAt: number };
          if (!cancelled) {
            setTotals({ views: cached.views, likes: cached.likes, prevViews: cached.prevViews, prevLikes: cached.prevLikes });
            setTotalsLoading(false);
          }
          cacheHit = true;
          // If fresh, skip the network call entirely
          if (Date.now() - cached.cachedAt < cacheTtl) return;
          // If stale, fall through to refresh silently in background
        }
      } catch {}

      try {
        // range=2m → fetch 60 days of metrics, split client-side into this month vs prev month
        const analyticsRes = await fetch("/api/analytics/metrics?range=2m", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const analyticsJson = await analyticsRes.json();
        if (!cancelled && analyticsJson.ok) {
          const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
          const metrics: any[] = analyticsJson.metrics ?? [];
          const thisMonth = metrics.filter((m) => new Date(m.postedAt).getTime() >= thirtyDaysAgo);
          const prevMonth = metrics.filter((m) => new Date(m.postedAt).getTime() < thirtyDaysAgo);
          const fresh = {
            views: thisMonth.reduce((s: number, m: any) => s + (m.views ?? 0), 0),
            likes: thisMonth.reduce((s: number, m: any) => s + (m.likes ?? 0), 0),
            prevViews: prevMonth.reduce((s: number, m: any) => s + (m.views ?? 0), 0),
            prevLikes: prevMonth.reduce((s: number, m: any) => s + (m.likes ?? 0), 0),
          };
          setTotals(fresh);
          try {
            localStorage.setItem(cacheKey, JSON.stringify({ ...fresh, cachedAt: Date.now() }));
          } catch {}
        }
      } catch {}
      if (!cancelled && !cacheHit) setTotalsLoading(false);
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#050505] text-white relative overflow-hidden">
      <AppPageOrb />

      {/* Nav */}
      <nav className="relative z-10 border-b border-white/5">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center"><img src="/logo.svg" alt="Clip Dash" className="h-10 w-auto" /></Link>
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
        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4">
          {/* Total Views */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_70px_rgba(2,6,23,0.45)] px-5 py-4">
            <p className="text-xs text-white/40 uppercase tracking-wider">Views <span className="normal-case tracking-normal text-white/20">· 30d</span></p>
            <div className="flex items-end gap-2 mt-1.5">
              <p className="text-3xl font-bold tabular-nums text-white">
                {totalsLoading ? (
                  <span className="inline-block w-12 h-8 rounded bg-white/[0.06] animate-pulse" />
                ) : totals ? (
                  formatStat(totals.views)
                ) : (
                  <span className="text-white/20 text-2xl">—</span>
                )}
              </p>
              {!totalsLoading && totals && totals.prevViews > 0 && (
                <span className={`mb-1 flex items-center gap-0.5 text-xs font-medium ${totals.views >= totals.prevViews ? "text-emerald-400" : "text-red-400"}`}>
                  {totals.views >= totals.prevViews ? (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" /></svg>
                  ) : (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3" /></svg>
                  )}
                  {Math.abs(Math.round(((totals.views - totals.prevViews) / totals.prevViews) * 100))}%
                </span>
              )}
            </div>
          </div>

          {/* Total Likes */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_70px_rgba(2,6,23,0.45)] px-5 py-4">
            <p className="text-xs text-white/40 uppercase tracking-wider">Likes <span className="normal-case tracking-normal text-white/20">· 30d</span></p>
            <div className="flex items-end gap-2 mt-1.5">
              <p className="text-3xl font-bold tabular-nums text-white">
                {totalsLoading ? (
                  <span className="inline-block w-12 h-8 rounded bg-white/[0.06] animate-pulse" />
                ) : totals ? (
                  formatStat(totals.likes)
                ) : (
                  <span className="text-white/20 text-2xl">—</span>
                )}
              </p>
              {!totalsLoading && totals && totals.prevLikes > 0 && (
                <span className={`mb-1 flex items-center gap-0.5 text-xs font-medium ${totals.likes >= totals.prevLikes ? "text-emerald-400" : "text-red-400"}`}>
                  {totals.likes >= totals.prevLikes ? (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" /></svg>
                  ) : (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3" /></svg>
                  )}
                  {Math.abs(Math.round(((totals.likes - totals.prevLikes) / totals.prevLikes) * 100))}%
                </span>
              )}
            </div>
          </div>

          {/* Posted */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_70px_rgba(2,6,23,0.45)] px-5 py-4">
            <p className="text-xs text-white/40 uppercase tracking-wider">Posted</p>
            <p className="text-3xl font-bold mt-1.5 tabular-nums text-emerald-400">
              {loading ? (
                <span className="inline-block w-8 h-8 rounded bg-white/[0.06] animate-pulse" />
              ) : (
                counts.posted
              )}
            </p>
          </div>

          {/* Scheduled */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_70px_rgba(2,6,23,0.45)] px-5 py-4">
            <p className="text-xs text-white/40 uppercase tracking-wider">Scheduled</p>
            <p className="text-3xl font-bold mt-1.5 tabular-nums text-blue-400">
              {loading ? (
                <span className="inline-block w-8 h-8 rounded bg-white/[0.06] animate-pulse" />
              ) : (
                counts.scheduled
              )}
            </p>
          </div>
        </div>

        {/* Upload CTA */}
        <div className="mt-6">
          <Link
            href="/uploads"
            className="group flex items-center justify-between rounded-3xl border border-violet-500/20 bg-gradient-to-r from-violet-500/[0.06] to-fuchsia-500/[0.03] shadow-[0_0_50px_rgba(139,92,246,0.07)] p-6 hover:border-violet-400/30 hover:from-violet-500/[0.09] hover:to-fuchsia-500/[0.06] transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center group-hover:from-violet-500/30 group-hover:to-fuchsia-500/30 transition-all">
                <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-white/90">Upload a new video</p>
                <p className="text-sm text-white/40 mt-0.5">Schedule across all your platforms in one go</p>
              </div>
            </div>
            <svg className="w-5 h-5 text-white/20 group-hover:text-violet-400/60 group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </Link>
        </div>

        {/* Calendar link */}
        <div className="mt-4">
          <Link
            href="/calendar"
            className="group flex items-center justify-between rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_70px_rgba(2,6,23,0.45)] p-5 hover:bg-white/[0.04] hover:border-white/20 transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-purple-500/10 flex items-center justify-center group-hover:bg-purple-500/15 transition-colors">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-white/90">Content Calendar</p>
                <p className="text-sm text-white/40 mt-0.5">See all your posts on a monthly calendar</p>
              </div>
            </div>
            <svg className="w-5 h-5 text-white/20 group-hover:text-white/40 group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </Link>
        </div>

        {/* Comments & Analytics — compact row */}
        <div className="mt-4 grid grid-cols-2 gap-4">
          <Link
            href="/comments"
            className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 hover:bg-white/[0.04] hover:border-white/20 transition-all"
          >
            <div className="h-8 w-8 shrink-0 rounded-lg bg-cyan-500/10 flex items-center justify-center group-hover:bg-cyan-500/15 transition-colors">
              <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-white/70 group-hover:text-white/90 transition-colors">Comments</span>
          </Link>
          <Link
            href="/analytics"
            className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 hover:bg-white/[0.04] hover:border-white/20 transition-all"
          >
            <div className="h-8 w-8 shrink-0 rounded-lg bg-sky-500/10 flex items-center justify-center group-hover:bg-sky-500/15 transition-colors">
              <svg className="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-white/70 group-hover:text-white/90 transition-colors">Analytics</span>
          </Link>
        </div>

        {/* Section label */}
        <div className="mt-10 mb-4">
          <h2 className="text-xs font-semibold text-white/30 uppercase tracking-widest">Overview</h2>
        </div>

        {/* Navigation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              href: "/scheduled",
              label: "Scheduled",
              desc: "Queued for publishing",
              count: counts.scheduled,
              color: "blue",
              icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              ),
            },
            {
              href: "/posted",
              label: "Posted",
              desc: "Successfully published",
              count: counts.posted,
              color: "emerald",
              icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              ),
            },
            {
              href: "/drafts",
              label: "Drafts",
              desc: "Saved for later",
              count: counts.drafts,
              color: "amber",
              icon: (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                </svg>
              ),
            },
          ].map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className={`group rounded-3xl border p-6 transition-all ${
                card.color === "blue"
                  ? "border-blue-500/[0.12] bg-blue-500/[0.02] shadow-[0_0_40px_rgba(59,130,246,0.04)] hover:bg-blue-500/[0.04] hover:border-blue-400/20"
                  : card.color === "emerald"
                  ? "border-emerald-500/[0.12] bg-emerald-500/[0.02] shadow-[0_0_40px_rgba(16,185,129,0.04)] hover:bg-emerald-500/[0.04] hover:border-emerald-400/20"
                  : "border-amber-500/[0.12] bg-amber-500/[0.02] shadow-[0_0_40px_rgba(245,158,11,0.04)] hover:bg-amber-500/[0.04] hover:border-amber-400/20"
              }`}
            >
              <div className="flex items-center justify-between">
                <div
                  className={`inline-flex rounded-xl p-3 ${
                    card.color === "blue"
                      ? "bg-blue-500/10 text-blue-400"
                      : card.color === "emerald"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-amber-500/10 text-amber-400"
                  }`}
                >
                  {card.icon}
                </div>
                <span
                  className={`text-3xl font-bold tabular-nums ${
                    card.color === "blue"
                      ? "text-blue-300/80"
                      : card.color === "emerald"
                      ? "text-emerald-300/80"
                      : "text-amber-300/80"
                  }`}
                >
                  {loading ? (
                    <span className="inline-block w-8 h-8 rounded bg-white/[0.06] animate-pulse" />
                  ) : (
                    card.count
                  )}
                </span>
              </div>
              <div className="mt-5">
                <h3 className="font-semibold text-white/90">{card.label}</h3>
                <p className="text-sm text-white/40 mt-0.5">{card.desc}</p>
              </div>
              <div
                className={`mt-5 pt-4 border-t border-white/5 flex items-center text-sm text-white/30 transition-colors ${
                  card.color === "blue"
                    ? "group-hover:text-blue-400/70"
                    : card.color === "emerald"
                    ? "group-hover:text-emerald-400/70"
                    : "group-hover:text-amber-400/70"
                }`}
              >
                View all
                <svg className="w-4 h-4 ml-1 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Floating help button */}
      <a
        href="/support"
        className="fixed bottom-6 right-6 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/50 shadow-lg backdrop-blur-sm transition-all hover:border-white/20 hover:bg-white/[0.12] hover:text-white/80"
        title="Help & Support"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
        </svg>
      </a>
    </main>
  );
}
