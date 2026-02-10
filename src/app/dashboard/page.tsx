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

      // Get team info
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

      // Get counts for each status
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
    <div className="min-h-screen bg-[#0A0A0A] text-white antialiased">
      {/* Background noise */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/[0.03] via-transparent to-transparent" />
      </div>

      <div className="mx-auto max-w-5xl px-6 pt-8 pb-16">
        {/* Top bar */}
        <nav className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-white flex items-center justify-center">
              <svg className="w-4 h-4 text-black" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
              </svg>
            </div>
            <span className="text-[15px] font-semibold tracking-tight text-white/90">Clip Dash</span>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/settings"
              className="rounded-lg px-3 py-1.5 text-[13px] text-white/50 hover:text-white/80 hover:bg-white/[0.06] transition-all"
            >
              Settings
            </Link>
            <div className="w-px h-4 bg-white/10" />
            <div className="flex items-center gap-2 pl-2">
              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center text-[11px] font-semibold">
                {sessionEmail ? sessionEmail[0].toUpperCase() : "?"}
              </div>
            </div>
          </div>
        </nav>

        {/* Stats row */}
        <div className="mt-10" />
        <div className="mt-8 grid grid-cols-4 gap-3">
          {[
            { label: "Total", value: totalPosts, color: "text-white/80" },
            { label: "Scheduled", value: counts.scheduled, color: "text-blue-400" },
            { label: "Posted", value: counts.posted, color: "text-emerald-400" },
            { label: "Drafts", value: counts.drafts, color: "text-amber-400" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
            >
              <p className="text-[11px] font-medium text-white/35 uppercase tracking-wider">{stat.label}</p>
              <p className={`text-2xl font-semibold mt-1 tabular-nums ${stat.color}`}>
                {loading ? (
                  <span className="inline-block w-6 h-6 rounded bg-white/[0.06] animate-pulse" />
                ) : (
                  stat.value
                )}
              </p>
            </div>
          ))}
        </div>

        {/* Upload CTA */}
        <div className="mt-8">
          <Link
            href="/upload"
            className="group flex items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 hover:bg-white/[0.05] hover:border-white/[0.12] transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-white/[0.08] flex items-center justify-center group-hover:bg-white/[0.12] transition-colors">
                <svg className="w-5 h-5 text-white/70" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </div>
              <div>
                <p className="text-[15px] font-medium text-white/90">Upload a new video</p>
                <p className="text-[13px] text-white/40 mt-0.5">Schedule across all your platforms in one go</p>
              </div>
            </div>
            <svg className="w-5 h-5 text-white/20 group-hover:text-white/40 group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </Link>
        </div>

        {/* Section label */}
        <div className="mt-10 mb-4">
          <h2 className="text-[11px] font-semibold text-white/30 uppercase tracking-widest">Overview</h2>
        </div>

        {/* Navigation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Scheduled */}
          <Link
            href="/scheduled"
            className="group relative rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 hover:bg-white/[0.04] hover:border-white/[0.1] transition-all overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/[0.04] rounded-full -translate-y-8 translate-x-8" />
            <div className="relative">
              <div className="flex items-center justify-between">
                <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                </div>
                <span className="text-[28px] font-semibold tabular-nums text-white/80">
                  {loading ? (
                    <span className="inline-block w-8 h-8 rounded bg-white/[0.06] animate-pulse" />
                  ) : (
                    counts.scheduled
                  )}
                </span>
              </div>
              <div className="mt-4">
                <h3 className="text-[14px] font-medium text-white/85">Scheduled</h3>
                <p className="text-[12px] text-white/35 mt-0.5">Queued for publishing</p>
              </div>
              <div className="mt-4 pt-3 border-t border-white/[0.04] flex items-center text-[12px] font-medium text-white/30 group-hover:text-blue-400/70 transition-colors">
                View all
                <svg className="w-3.5 h-3.5 ml-1 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </div>
            </div>
          </Link>

          {/* Posted */}
          <Link
            href="/posted"
            className="group relative rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 hover:bg-white/[0.04] hover:border-white/[0.1] transition-all overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/[0.04] rounded-full -translate-y-8 translate-x-8" />
            <div className="relative">
              <div className="flex items-center justify-between">
                <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                </div>
                <span className="text-[28px] font-semibold tabular-nums text-white/80">
                  {loading ? (
                    <span className="inline-block w-8 h-8 rounded bg-white/[0.06] animate-pulse" />
                  ) : (
                    counts.posted
                  )}
                </span>
              </div>
              <div className="mt-4">
                <h3 className="text-[14px] font-medium text-white/85">Posted</h3>
                <p className="text-[12px] text-white/35 mt-0.5">Successfully published</p>
              </div>
              <div className="mt-4 pt-3 border-t border-white/[0.04] flex items-center text-[12px] font-medium text-white/30 group-hover:text-emerald-400/70 transition-colors">
                View all
                <svg className="w-3.5 h-3.5 ml-1 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </div>
            </div>
          </Link>

          {/* Drafts */}
          <Link
            href="/drafts"
            className="group relative rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 hover:bg-white/[0.04] hover:border-white/[0.1] transition-all overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/[0.04] rounded-full -translate-y-8 translate-x-8" />
            <div className="relative">
              <div className="flex items-center justify-between">
                <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                  </svg>
                </div>
                <span className="text-[28px] font-semibold tabular-nums text-white/80">
                  {loading ? (
                    <span className="inline-block w-8 h-8 rounded bg-white/[0.06] animate-pulse" />
                  ) : (
                    counts.drafts
                  )}
                </span>
              </div>
              <div className="mt-4">
                <h3 className="text-[14px] font-medium text-white/85">Drafts</h3>
                <p className="text-[12px] text-white/35 mt-0.5">Saved for later</p>
              </div>
              <div className="mt-4 pt-3 border-t border-white/[0.04] flex items-center text-[12px] font-medium text-white/30 group-hover:text-amber-400/70 transition-colors">
                View all
                <svg className="w-3.5 h-3.5 ml-1 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
