"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/login/supabaseClient";

type PostCounts = {
  scheduled: number;
  posted: number;
  drafts: number;
};

export default function DashboardPage() {
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [counts, setCounts] = useState<PostCounts>({ scheduled: 0, posted: 0, drafts: 0 });
  const [loading, setLoading] = useState(true);

  const totalPosts = counts.scheduled + counts.posted + counts.drafts;

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
        return;
      }

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
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#050505] text-white relative overflow-hidden">
      {/* Background gradient orbs */}
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-blue-500/[0.07] via-purple-500/[0.04] to-transparent rounded-full blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 w-[500px] h-[500px] bg-gradient-to-t from-purple-500/[0.05] to-transparent rounded-full blur-3xl" />

      {/* Nav */}
      <nav className="relative z-10 border-b border-white/5">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
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

      <div className="relative z-10 mx-auto max-w-5xl px-6 pt-10 pb-16">
        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Total", value: totalPosts, color: "text-white" },
            { label: "Scheduled", value: counts.scheduled, color: "text-blue-400" },
            { label: "Posted", value: counts.posted, color: "text-emerald-400" },
            { label: "Drafts", value: counts.drafts, color: "text-amber-400" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4"
            >
              <p className="text-xs text-white/40 uppercase tracking-wider">{stat.label}</p>
              <p className={`text-3xl font-bold mt-1.5 tabular-nums ${stat.color}`}>
                {loading ? (
                  <span className="inline-block w-8 h-8 rounded bg-white/[0.06] animate-pulse" />
                ) : (
                  stat.value
                )}
              </p>
            </div>
          ))}
        </div>

        {/* Upload CTA */}
        <div className="mt-6">
          <Link
            href="/upload"
            className="group flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] p-6 hover:bg-white/[0.04] hover:border-white/20 transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-white/[0.06] flex items-center justify-center group-hover:bg-white/[0.10] transition-colors">
                <svg className="w-5 h-5 text-white/60" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-white/90">Upload a new video</p>
                <p className="text-sm text-white/40 mt-0.5">Schedule across all your platforms in one go</p>
              </div>
            </div>
            <svg className="w-5 h-5 text-white/20 group-hover:text-white/40 group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </Link>
        </div>

        {/* Calendar link */}
        <div className="mt-4">
          <Link
            href="/calendar"
            className="group flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] p-5 hover:bg-white/[0.04] hover:border-white/20 transition-all"
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

        {/* Comments link */}
        <div className="mt-4">
          <Link
            href="/comments"
            className="group flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] p-5 hover:bg-white/[0.04] hover:border-white/20 transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-cyan-500/10 flex items-center justify-center group-hover:bg-cyan-500/15 transition-colors">
                <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-white/90">Comments</p>
                <p className="text-sm text-white/40 mt-0.5">See recent comments across your platforms</p>
              </div>
            </div>
            <svg className="w-5 h-5 text-white/20 group-hover:text-white/40 group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </Link>
        </div>

        {/* Section label */}
        <div className="mt-10 mb-4">
          <h2 className="text-xs font-semibold text-white/30 uppercase tracking-widest">Overview</h2>
        </div>

        {/* Navigation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Scheduled */}
          <Link
            href="/scheduled"
            className="group rounded-2xl border border-white/10 bg-white/[0.02] p-6 hover:bg-white/[0.04] hover:border-white/20 transition-all"
          >
            <div className="flex items-center justify-between">
              <div className="inline-flex rounded-xl p-3 bg-blue-500/10 text-blue-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
              <span className="text-3xl font-bold tabular-nums text-white/80">
                {loading ? (
                  <span className="inline-block w-8 h-8 rounded bg-white/[0.06] animate-pulse" />
                ) : (
                  counts.scheduled
                )}
              </span>
            </div>
            <div className="mt-5">
              <h3 className="font-semibold text-white/90">Scheduled</h3>
              <p className="text-sm text-white/40 mt-0.5">Queued for publishing</p>
            </div>
            <div className="mt-5 pt-4 border-t border-white/5 flex items-center text-sm text-white/30 group-hover:text-blue-400/70 transition-colors">
              View all
              <svg className="w-4 h-4 ml-1 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </Link>

          {/* Posted */}
          <Link
            href="/posted"
            className="group rounded-2xl border border-white/10 bg-white/[0.02] p-6 hover:bg-white/[0.04] hover:border-white/20 transition-all"
          >
            <div className="flex items-center justify-between">
              <div className="inline-flex rounded-xl p-3 bg-emerald-500/10 text-emerald-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>
              <span className="text-3xl font-bold tabular-nums text-white/80">
                {loading ? (
                  <span className="inline-block w-8 h-8 rounded bg-white/[0.06] animate-pulse" />
                ) : (
                  counts.posted
                )}
              </span>
            </div>
            <div className="mt-5">
              <h3 className="font-semibold text-white/90">Posted</h3>
              <p className="text-sm text-white/40 mt-0.5">Successfully published</p>
            </div>
            <div className="mt-5 pt-4 border-t border-white/5 flex items-center text-sm text-white/30 group-hover:text-emerald-400/70 transition-colors">
              View all
              <svg className="w-4 h-4 ml-1 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </Link>

          {/* Drafts */}
          <Link
            href="/drafts"
            className="group rounded-2xl border border-white/10 bg-white/[0.02] p-6 hover:bg-white/[0.04] hover:border-white/20 transition-all"
          >
            <div className="flex items-center justify-between">
              <div className="inline-flex rounded-xl p-3 bg-amber-500/10 text-amber-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                </svg>
              </div>
              <span className="text-3xl font-bold tabular-nums text-white/80">
                {loading ? (
                  <span className="inline-block w-8 h-8 rounded bg-white/[0.06] animate-pulse" />
                ) : (
                  counts.drafts
                )}
              </span>
            </div>
            <div className="mt-5">
              <h3 className="font-semibold text-white/90">Drafts</h3>
              <p className="text-sm text-white/40 mt-0.5">Saved for later</p>
            </div>
            <div className="mt-5 pt-4 border-t border-white/5 flex items-center text-sm text-white/30 group-hover:text-amber-400/70 transition-colors">
              View all
              <svg className="w-4 h-4 ml-1 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </Link>
        </div>
      </div>
    </main>
  );
}
