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

  const failedGroups = groups.filter((g) => g.groupStatus === "failed" || g.groupStatus === "partial_failure").length;
  const platformCount = new Set(groups.flatMap((g) => g.posts.map((p) => p.provider || "unknown"))).size;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050505] text-white">
      <div className="pointer-events-none absolute top-0 left-1/2 h-[620px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-b from-blue-500/[0.08] via-purple-500/[0.06] to-transparent blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] rounded-full bg-gradient-to-t from-purple-500/[0.06] to-transparent blur-3xl" />
      <div className="pointer-events-none absolute -top-20 left-[-6rem] h-64 w-64 rounded-full bg-pink-500/[0.05] blur-3xl" />

      <nav className="relative z-10 border-b border-white/5">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="text-lg font-semibold tracking-tight transition-colors hover:text-white/80">Clip Dash</Link>
          <div className="flex items-center gap-3">
            <Link href="/settings" className="text-sm text-white/40 transition-colors hover:text-white/70">Settings</Link>
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-[11px] font-semibold">
              {sessionEmail ? sessionEmail[0].toUpperCase() : "?"}
            </div>
          </div>
        </div>
      </nav>

      <div className="relative z-10 mx-auto max-w-6xl px-6 pb-16 pt-10">
        <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-8">
          <div className="mb-5 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-blue-400/30 bg-blue-400/10 px-3 py-1 font-medium text-blue-300">Queue</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-medium text-white/60">Scheduled</span>
          </div>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3">
              <Link
                href="/dashboard"
                className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/40 transition-all hover:bg-white/10 hover:text-white/70"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </Link>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Scheduled Posts</h1>
                <p className="mt-2 text-sm text-white/70 sm:text-base">
                  {loading ? "Loading queue..." : `${groups.length} post${groups.length === 1 ? "" : "s"} lined up to publish automatically.`}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/calendar" className="rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/70 transition-colors hover:bg-white/10">
                Calendar
              </Link>
              <Link href="/upload" className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-white/90">
                New upload
              </Link>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-white/40">Queued</p>
              <p className="mt-1 text-2xl font-semibold text-white">{loading ? "..." : groups.length}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-white/40">Platforms Active</p>
              <p className="mt-1 text-2xl font-semibold text-blue-300">{loading ? "..." : platformCount}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-white/40">Needs Attention</p>
              <p className="mt-1 text-2xl font-semibold text-amber-300">{loading ? "..." : failedGroups}</p>
            </div>
          </div>
        </section>

        <section className="mt-8">
          {loading ? (
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_70px_rgba(2,6,23,0.45)]">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="border-t border-white/5 px-5 py-4 first:border-t-0">
                  <div className="flex items-center gap-4">
                    <div className="h-4 w-32 animate-pulse rounded bg-white/[0.06]" />
                    <div className="h-4 w-16 animate-pulse rounded bg-white/[0.06]" />
                    <div className="ml-auto h-4 w-20 animate-pulse rounded bg-white/[0.06]" />
                  </div>
                </div>
              ))}
            </div>
          ) : groups.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-16 text-center shadow-[0_20px_70px_rgba(2,6,23,0.45)]">
              <div className="mx-auto inline-flex rounded-xl bg-blue-500/10 p-3 text-blue-300">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
              <p className="mt-4 font-semibold text-white">No scheduled posts</p>
              <p className="mt-1 text-sm text-white/50">Upload a video and choose a publish time to populate your queue.</p>
              <Link href="/upload" className="mt-5 inline-flex rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-white/90">
                Upload your first video
              </Link>
            </div>
          ) : (
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_70px_rgba(2,6,23,0.45)]">
              <div className="hidden grid-cols-12 gap-3 border-b border-white/10 px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-white/40 md:grid">
                <div className="col-span-4">Title</div>
                <div className="col-span-3">Platforms</div>
                <div className="col-span-2">Scheduled</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-1 text-right">Actions</div>
              </div>
              <div className="divide-y divide-white/5">
                {groups.map((group) => {
                  const statusInfo = getGroupStatusDisplay(group);
                  const allPostIds = group.posts.map((p) => p.id);
                  const failedPostIds = group.posts.filter((p) => p.status === "failed").map((p) => p.id);
                  const hasFailed = failedPostIds.length > 0;

                  return (
                    <div key={group.groupId} className="px-5 py-4 transition-colors hover:bg-white/[0.04]">
                      <div className="grid items-center gap-3 md:grid-cols-12">
                        <div className="min-w-0 md:col-span-4">
                          <p className="truncate font-medium text-white">{group.title || "Untitled"}</p>
                          {group.description ? <p className="mt-1 line-clamp-1 text-xs text-white/40">{group.description}</p> : null}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 md:col-span-3">
                          {group.posts.map((post) => (
                            <span
                              key={post.id}
                              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${getStatusBadgeStyle(post.status)}`}
                              title={`${providerLabel(post.provider)}: ${post.status}${post.last_error ? ` - ${post.last_error}` : ""}`}
                            >
                              {providerLabel(post.provider)}
                            </span>
                          ))}
                        </div>

                        <span className="text-xs tabular-nums text-white/40 md:col-span-2">
                          {formatDate(group.scheduled_for)}, {formatTime(group.scheduled_for)}
                        </span>

                        <span className={`text-xs font-semibold tabular-nums md:col-span-2 ${statusInfo.color} ${statusInfo.pulse ? "animate-pulse" : ""}`}>
                          {statusInfo.text}
                        </span>

                        <div className="flex items-center justify-start gap-2 md:col-span-1 md:justify-end">
                          <button
                            onClick={() => handleCancel(group.groupId, allPostIds)}
                            disabled={canceling === group.groupId}
                            className={`rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-50 ${hasFailed ? "border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/20" : "border-white/10 bg-white/5 text-white/60 hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-300"}`}
                          >
                            {canceling === group.groupId ? (hasFailed ? "Removing..." : "Canceling...") : hasFailed ? "Remove" : "Cancel"}
                          </button>
                          {hasFailed ? (
                            <button
                              onClick={() => handleRetry(group.groupId, failedPostIds)}
                              disabled={retrying === group.groupId}
                              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
                            >
                              {retrying === group.groupId ? "Retrying..." : "Retry"}
                            </button>
                          ) : null}
                        </div>
                      </div>
                      {hasFailed ? (
                        <p className="mt-2 text-xs text-red-400/80">
                          {failedPostIds.length === group.posts.length
                            ? "Upload failed"
                            : `Failed on ${group.posts.filter((p) => p.status === "failed").map((p) => providerLabel(p.provider)).join(", ")}`}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
