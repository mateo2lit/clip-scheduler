"use client";

import { useEffect, useMemo, useState } from "react";
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

  const now = useMemo(() => new Date(), []);

  const greeting = useMemo(() => {
    const h = now.getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }, [now]);

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
    <div className="min-h-screen bg-[#050505] text-white">
      {/* Subtle gradient background */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-neutral-900/50 via-transparent to-transparent" />
        <div className="absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-white/[0.02] blur-3xl" />
      </div>

      <div className="mx-auto max-w-4xl px-6 py-12">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white/40">{greeting}</p>
            <h1 className="text-2xl font-medium tracking-tight mt-1">
              {sessionEmail ? sessionEmail.split("@")[0] : "Dashboard"}
            </h1>
          </div>

          <Link
            href="/settings"
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          >
            Settings
          </Link>
        </div>

        {/* Central Upload CTA */}
        <div className="mt-16 flex flex-col items-center text-center">
          <div className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-white/50 mb-6">
            Upload once, publish everywhere
          </div>

          <h2 className="text-4xl font-semibold tracking-tight">
            Ready to share your content?
          </h2>
          <p className="text-white/50 mt-3 max-w-md">
            Upload your video and schedule it across all your platforms with just a few clicks.
          </p>

          <Link
            href="/upload"
            className="mt-8 group relative inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-base font-semibold text-black hover:bg-white/90 transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Upload a new video
          </Link>
        </div>

        {/* Navigation Cards */}
        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/scheduled"
            className="group rounded-2xl border border-white/10 bg-white/[0.02] p-6 hover:bg-white/[0.04] hover:border-white/20 transition-all"
          >
            <div className="flex items-center justify-between">
              <div className="rounded-full bg-blue-500/10 p-3">
                <svg
                  className="w-5 h-5 text-blue-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <span className="text-2xl font-semibold text-white/90">
                {loading ? "–" : counts.scheduled}
              </span>
            </div>
            <div className="mt-4">
              <h3 className="font-medium text-white/90">Scheduled</h3>
              <p className="text-sm text-white/40 mt-1">
                Posts queued for the future
              </p>
            </div>
            <div className="mt-4 flex items-center text-sm text-white/40 group-hover:text-white/60 transition-colors">
              View all
              <svg
                className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </div>
          </Link>

          <Link
            href="/posted"
            className="group rounded-2xl border border-white/10 bg-white/[0.02] p-6 hover:bg-white/[0.04] hover:border-white/20 transition-all"
          >
            <div className="flex items-center justify-between">
              <div className="rounded-full bg-emerald-500/10 p-3">
                <svg
                  className="w-5 h-5 text-emerald-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <span className="text-2xl font-semibold text-white/90">
                {loading ? "–" : counts.posted}
              </span>
            </div>
            <div className="mt-4">
              <h3 className="font-medium text-white/90">Posted</h3>
              <p className="text-sm text-white/40 mt-1">
                Successfully published content
              </p>
            </div>
            <div className="mt-4 flex items-center text-sm text-white/40 group-hover:text-white/60 transition-colors">
              View all
              <svg
                className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </div>
          </Link>

          <Link
            href="/drafts"
            className="group rounded-2xl border border-white/10 bg-white/[0.02] p-6 hover:bg-white/[0.04] hover:border-white/20 transition-all"
          >
            <div className="flex items-center justify-between">
              <div className="rounded-full bg-amber-500/10 p-3">
                <svg
                  className="w-5 h-5 text-amber-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </div>
              <span className="text-2xl font-semibold text-white/90">
                {loading ? "–" : counts.drafts}
              </span>
            </div>
            <div className="mt-4">
              <h3 className="font-medium text-white/90">Drafts</h3>
              <p className="text-sm text-white/40 mt-1">
                Saved but not yet scheduled
              </p>
            </div>
            <div className="mt-4 flex items-center text-sm text-white/40 group-hover:text-white/60 transition-colors">
              View all
              <svg
                className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </div>
          </Link>
        </div>

        {/* Quick Stats Footer */}
        <div className="mt-16 pt-8 border-t border-white/5">
          <div className="flex items-center justify-between text-sm text-white/30">
            <span>Clip Scheduler</span>
            <div className="flex items-center gap-6">
              <Link href="/settings" className="hover:text-white/60 transition-colors">
                Connected accounts
              </Link>
              <Link href="/upload" className="hover:text-white/60 transition-colors">
                New upload
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
