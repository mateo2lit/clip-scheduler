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

  if (diffMs < 0) return "Posting soon\u2026";
  if (diffHours < 1) return "< 1 hr";
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 7) return `${diffDays}d`;
  return formatDate(iso);
}

function getRelativeColor(iso: string) {
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs < 0) return "text-amber-400";
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

function getTimeEstimate(provider: string | null) {
  if (provider === "instagram") return "Usually posts within ~3-5 minutes";
  return "Usually posts within ~1 minute";
}

function getStatusDisplay(post: ScheduledPost) {
  if (post.status === "ig_processing") {
    return { text: "Processing video\u2026", color: "text-blue-400", pulse: true };
  }
  // scheduled + past due
  const diffMs = new Date(post.scheduled_for).getTime() - Date.now();
  if (diffMs < 0) {
    return { text: "Posting soon\u2026", color: "text-amber-400", pulse: false };
  }
  return { text: getRelativeTime(post.scheduled_for), color: getRelativeColor(post.scheduled_for), pulse: false };
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
        .in("status", ["scheduled", "ig_processing"])
        .order("scheduled_for", { ascending: true });

      setPosts(data ?? []);
      setLoading(false);
    }

    load();
  }, []);

  return (
    <main className="min-h-screen bg-[#050505] text-white relative overflow-hidden">
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-blue-500/[0.07] via-purple-500/[0.04] to-transparent rounded-full blur-3xl" />

      {/* Nav */}
      <nav className="relative z-10 border-b border-white/5">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="text-lg font-semibold tracking-tight hover:text-white/80 transition-colors">Clip Dash</Link>
          <div className="flex items-center gap-3">
            <Link href="/settings" className="text-sm text-white/40 hover:text-white/70 transition-colors">Settings</Link>
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-[11px] font-semibold">
              {sessionEmail ? sessionEmail[0].toUpperCase() : "?"}
            </div>
          </div>
        </div>
      </nav>

      <div className="relative z-10 mx-auto max-w-5xl px-6 pt-10 pb-16">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="h-8 w-8 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/10 transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </Link>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Scheduled</h1>
              <p className="text-sm text-white/40">
                {loading ? "Loading..." : `${posts.length} post${posts.length === 1 ? "" : "s"} queued`}
              </p>
            </div>
          </div>

          <Link
            href="/upload"
            className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black hover:bg-white/90 transition-colors"
          >
            New upload
          </Link>
        </div>

        {/* Posts */}
        <div className="mt-8">
          {loading ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02]">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="px-5 py-4 border-t border-white/5 first:border-t-0">
                  <div className="flex items-center gap-4">
                    <div className="h-4 w-32 rounded bg-white/[0.06] animate-pulse" />
                    <div className="h-4 w-16 rounded bg-white/[0.06] animate-pulse" />
                    <div className="ml-auto h-4 w-20 rounded bg-white/[0.06] animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : posts.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-16 text-center">
              <div className="inline-flex rounded-xl p-3 bg-blue-500/10 text-blue-400 mx-auto">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
              <p className="font-semibold text-white/90 mt-4">No scheduled posts</p>
              <p className="text-sm text-white/40 mt-1">Upload a video and schedule it to see it here.</p>
              <Link
                href="/upload"
                className="inline-flex mt-5 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black hover:bg-white/90 transition-colors"
              >
                Upload your first video
              </Link>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] divide-y divide-white/5">
              {posts.map((post) => {
                const statusInfo = getStatusDisplay(post);
                return (
                  <div
                    key={post.id}
                    className="px-5 py-4 hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-white/90 truncate">
                          {post.title || "Untitled"}
                        </p>
                      </div>

                      <span className="shrink-0 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-400 border border-blue-500/20">
                        {providerLabel(post.provider)}
                      </span>

                      <span className="shrink-0 text-xs text-white/30 tabular-nums hidden sm:block">
                        {formatDate(post.scheduled_for)}, {formatTime(post.scheduled_for)}
                      </span>

                      <span className={`shrink-0 text-xs font-semibold tabular-nums text-right ${statusInfo.color} ${statusInfo.pulse ? "animate-pulse" : ""}`}>
                        {statusInfo.text}
                      </span>
                    </div>
                    <p className="text-xs text-white/20 mt-1">
                      {post.description ? (
                        <span className="text-white/30 line-clamp-1">{post.description} · </span>
                      ) : null}
                      {getTimeEstimate(post.provider)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
