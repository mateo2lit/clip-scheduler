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
  last_error: string | null;
  group_id: string | null;
};

type PostGroup = {
  groupId: string;
  title: string | null;
  description: string | null;
  scheduled_for: string;
  posts: ScheduledPost[];
  groupStatus: "scheduled" | "posting" | "failed" | "partial_failure";
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

function providerLabel(provider: string | null) {
  if (!provider) return "Unknown";
  const labels: Record<string, string> = {
    youtube: "YouTube",
    tiktok: "TikTok",
    instagram: "Instagram",
    x: "X",
    facebook: "Facebook",
    linkedin: "LinkedIn",
  };
  return labels[provider.toLowerCase()] || provider;
}

function getStatusBadgeStyle(status: string) {
  switch (status) {
    case "posted":
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    case "failed":
      return "bg-red-500/10 text-red-400 border-red-500/20";
    case "posting":
    case "ig_processing":
      return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    default:
      return "bg-blue-500/10 text-blue-400 border-blue-500/20";
  }
}

function computeGroupStatus(posts: ScheduledPost[]): PostGroup["groupStatus"] {
  const allFailed = posts.every((p) => p.status === "failed");
  const anyFailed = posts.some((p) => p.status === "failed");
  const anyPosting = posts.some((p) => p.status === "posting" || p.status === "ig_processing");

  if (allFailed) return "failed";
  if (anyFailed) return "partial_failure";
  if (anyPosting) return "posting";
  return "scheduled";
}

function groupPosts(posts: ScheduledPost[]): PostGroup[] {
  const groups = new Map<string, ScheduledPost[]>();

  for (const post of posts) {
    const key = post.group_id || post.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(post);
  }

  return Array.from(groups.entries()).map(([groupId, groupPosts]) => ({
    groupId,
    title: groupPosts[0].title,
    description: groupPosts[0].description,
    scheduled_for: groupPosts[0].scheduled_for,
    posts: groupPosts,
    groupStatus: computeGroupStatus(groupPosts),
  }));
}

function getGroupStatusDisplay(group: PostGroup) {
  if (group.groupStatus === "failed") {
    return { text: "Failed", color: "text-red-400", pulse: false };
  }
  if (group.groupStatus === "partial_failure") {
    const failedPlatforms = group.posts.filter((p) => p.status === "failed").map((p) => providerLabel(p.provider));
    return { text: `Failed: ${failedPlatforms.join(", ")}`, color: "text-red-400", pulse: false };
  }
  if (group.groupStatus === "posting") {
    return { text: "Posting\u2026", color: "text-amber-400", pulse: true };
  }
  const diffMs = new Date(group.scheduled_for).getTime() - Date.now();
  if (diffMs < 0) {
    return { text: "Posting soon\u2026", color: "text-amber-400", pulse: false };
  }
  return { text: getRelativeTime(group.scheduled_for), color: "text-blue-400", pulse: false };
}

export default function ScheduledPage() {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [canceling, setCanceling] = useState<string | null>(null);

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
        .select("id, title, description, provider, scheduled_for, status, created_at, last_error, group_id")
        .eq("team_id", teamId)
        .in("status", ["scheduled", "ig_processing", "failed"])
        .order("scheduled_for", { ascending: true });

      setPosts(data ?? []);
      setLoading(false);
    }

    load();
  }, []);

  const groups = groupPosts(posts);

  async function handleRetry(groupId: string, postIds: string[]) {
    setRetrying(groupId);
    try {
      for (const postId of postIds) {
        const { error } = await supabase
          .from("scheduled_posts")
          .update({ status: "scheduled", last_error: null, scheduled_for: new Date().toISOString() })
          .eq("id", postId);
        if (error) throw error;
      }

      setPosts((prev) =>
        prev.map((p) =>
          postIds.includes(p.id) ? { ...p, status: "scheduled", last_error: null, scheduled_for: new Date().toISOString() } : p
        )
      );
    } catch (e: any) {
      alert(e?.message || "Failed to retry");
    } finally {
      setRetrying(null);
    }
  }

  async function handleCancel(groupId: string, postIds: string[]) {
    if (!confirm(`Cancel ${postIds.length > 1 ? "these scheduled posts" : "this scheduled post"}?`)) return;
    setCanceling(groupId);
    try {
      for (const postId of postIds) {
        const { error } = await supabase
          .from("scheduled_posts")
          .delete()
          .eq("id", postId);
        if (error) throw error;
      }
      setPosts((prev) => prev.filter((p) => !postIds.includes(p.id)));
    } catch (e: any) {
      alert(e?.message || "Failed to cancel");
    } finally {
      setCanceling(null);
    }
  }

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
                {loading ? "Loading..." : `${groups.length} post${groups.length === 1 ? "" : "s"} queued`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/calendar"
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/60 hover:bg-white/10 transition-colors"
            >
              Calendar
            </Link>
            <Link
              href="/upload"
              className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black hover:bg-white/90 transition-colors"
            >
              New upload
            </Link>
          </div>
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
          ) : groups.length === 0 ? (
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
              {groups.map((group) => {
                const statusInfo = getGroupStatusDisplay(group);
                const allPostIds = group.posts.map((p) => p.id);
                const failedPostIds = group.posts.filter((p) => p.status === "failed").map((p) => p.id);
                const hasFailed = failedPostIds.length > 0;

                return (
                  <div
                    key={group.groupId}
                    className="px-5 py-4 hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-white/90 truncate">
                          {group.title || "Untitled"}
                        </p>
                      </div>

                      <div className="shrink-0 flex items-center gap-1.5">
                        {group.posts.map((post) => (
                          <span
                            key={post.id}
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium border ${getStatusBadgeStyle(post.status)}`}
                            title={`${providerLabel(post.provider)}: ${post.status}${post.last_error ? ` - ${post.last_error}` : ""}`}
                          >
                            {providerLabel(post.provider)}
                          </span>
                        ))}
                      </div>

                      <span className="shrink-0 text-xs text-white/30 tabular-nums hidden sm:block">
                        {formatDate(group.scheduled_for)}, {formatTime(group.scheduled_for)}
                      </span>

                      <span className={`shrink-0 text-xs font-semibold tabular-nums text-right ${statusInfo.color} ${statusInfo.pulse ? "animate-pulse" : ""}`}>
                        {statusInfo.text}
                      </span>
                    </div>

                    {hasFailed ? (
                      <div className="mt-2 flex items-center gap-3">
                        <p className="text-xs text-red-400/70 flex-1">
                          {failedPostIds.length === group.posts.length
                            ? "Upload failed"
                            : `Failed on ${group.posts.filter((p) => p.status === "failed").map((p) => providerLabel(p.provider)).join(", ")}`}
                        </p>
                        <button
                          onClick={() => handleCancel(group.groupId, allPostIds)}
                          disabled={canceling === group.groupId}
                          className="shrink-0 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                        >
                          {canceling === group.groupId ? "Removing..." : "Remove"}
                        </button>
                        <button
                          onClick={() => handleRetry(group.groupId, failedPostIds)}
                          disabled={retrying === group.groupId}
                          className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white/90 transition-colors disabled:opacity-50"
                        >
                          {retrying === group.groupId ? "Retrying..." : "Retry failed"}
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2 flex items-center gap-3">
                        <p className="text-xs text-white/20 flex-1">
                          {group.description ? (
                            <span className="text-white/30 line-clamp-1">{group.description}</span>
                          ) : null}
                        </p>
                        <button
                          onClick={() => handleCancel(group.groupId, allPostIds)}
                          disabled={canceling === group.groupId}
                          className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/40 hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-400 transition-colors disabled:opacity-50"
                        >
                          {canceling === group.groupId ? "Canceling..." : "Cancel"}
                        </button>
                      </div>
                    )}
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
