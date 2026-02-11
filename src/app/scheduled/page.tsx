"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/login/supabaseClient";

type ScheduledPost = {
  id: string;
  title: string | null;
  description: string | null;
  provider: string | null;
  scheduled_for: string;
  status: string;
  created_at: string;
};

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function getRelativeTime(iso: string) {
  const now = new Date();
  const target = new Date(iso);
  const diffMs = target.getTime() - now.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMs < 0) return "Overdue";
  if (diffHours < 1) return "< 1 hr";
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 7) return `${diffDays}d`;
  return formatDate(iso);
}

function getRelativeColor(iso: string) {
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs < 0) return "text-red-400";
  if (diffMs < 1000 * 60 * 60) return "text-amber-400";
  return "text-blue-400";
}

function providerLabel(provider: string | null) {
  if (!provider) return "Unknown";
  const labels: Record<string, string> = {
    youtube: "YouTube",
    tiktok: "TikTok",
    instagram: "Instagram",
    x: "X",
    facebook: "Facebook",
  };
  return labels[provider.toLowerCase()] || provider;
}

export default function ScheduledPage() {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) {
        window.location.href = "/login";
        return;
      }

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

      if (!teamId) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("scheduled_posts")
        .select("id, title, description, provider, scheduled_for, status, created_at")
        .eq("team_id", teamId)
        .eq("status", "scheduled")
        .order("scheduled_for", { ascending: true });

      setPosts(data ?? []);
      setLoading(false);
    }

    load();
  }, []);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white antialiased">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/[0.03] via-transparent to-transparent" />
      </div>

      <div className="mx-auto max-w-5xl px-6 pt-8 pb-16">
        {/* Nav */}
        <nav className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-3 group">
              <div className="h-8 w-8 rounded-lg bg-white flex items-center justify-center">
                <svg className="w-4 h-4 text-black" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                </svg>
              </div>
              <span className="text-[15px] font-semibold tracking-tight text-white/90 group-hover:text-white transition-colors">Clip Dash</span>
            </Link>
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

        {/* Header */}
        <div className="mt-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="h-8 w-8 rounded-lg border border-white/[0.06] bg-white/[0.02] flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </Link>
            <div>
              <h1 className="text-[15px] font-semibold tracking-tight text-white/90">Scheduled</h1>
              <p className="text-[12px] text-white/35">
                {loading ? "Loading..." : `${posts.length} post${posts.length === 1 ? "" : "s"} queued`}
              </p>
            </div>
          </div>

          <Link
            href="/upload"
            className="rounded-lg bg-white px-4 py-2 text-[13px] font-medium text-black hover:bg-white/90 transition-colors"
          >
            New upload
          </Link>
        </div>

        {/* Posts */}
        <div className="mt-6">
          {loading ? (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="px-5 py-4 border-t border-white/[0.04] first:border-t-0">
                  <div className="flex items-center gap-4">
                    <div className="h-4 w-32 rounded bg-white/[0.06] animate-pulse" />
                    <div className="h-4 w-16 rounded bg-white/[0.06] animate-pulse" />
                    <div className="ml-auto h-4 w-20 rounded bg-white/[0.06] animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : posts.length === 0 ? (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-6 py-16 text-center">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center mx-auto">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
              <p className="text-[14px] font-medium text-white/80 mt-4">No scheduled posts</p>
              <p className="text-[13px] text-white/35 mt-1">Upload a video and schedule it to see it here.</p>
              <Link
                href="/upload"
                className="inline-flex mt-5 rounded-lg bg-white px-5 py-2.5 text-[13px] font-medium text-black hover:bg-white/90 transition-colors"
              >
                Upload your first video
              </Link>
            </div>
          ) : (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.04]">
              {posts.map((post) => (
                <div
                  key={post.id}
                  className="px-5 py-4 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-4">
                    {/* Title */}
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-medium text-white/85 truncate">
                        {post.title || "Untitled"}
                      </p>
                    </div>

                    {/* Provider pill */}
                    <span className="shrink-0 rounded-md bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-400">
                      {providerLabel(post.provider)}
                    </span>

                    {/* Date + time */}
                    <span className="shrink-0 text-[12px] text-white/30 tabular-nums hidden sm:block">
                      {formatDate(post.scheduled_for)}, {formatTime(post.scheduled_for)}
                    </span>

                    {/* Relative time */}
                    <span className={`shrink-0 text-[12px] font-medium tabular-nums w-16 text-right ${getRelativeColor(post.scheduled_for)}`}>
                      {getRelativeTime(post.scheduled_for)}
                    </span>
                  </div>
                  {post.description && (
                    <p className="text-[12px] text-white/25 mt-1 line-clamp-1 pl-0">
                      {post.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
