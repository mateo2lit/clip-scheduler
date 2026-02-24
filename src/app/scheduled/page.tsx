"use client";

import { useEffect, useRef, useState } from "react";
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
  thumbnail_path?: string | null;
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

function ProviderIcon({ provider, className = "w-5 h-5" }: { provider: string | null; className?: string }) {
  const p = provider?.toLowerCase();
  if (p === "youtube") {
    return <svg className={`${className} text-red-500`} viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814ZM9.545 15.568V8.432L15.818 12l-6.273 3.568Z" /></svg>;
  }
  if (p === "facebook") {
    return <svg className={`${className} text-blue-500`} viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073Z" /></svg>;
  }
  if (p === "instagram") {
    return <svg className={`${className} text-pink-500`} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069ZM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0Zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881Z" /></svg>;
  }
  if (p === "tiktok") {
    return <svg className={`${className} text-white`} viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07Z" /></svg>;
  }
  if (p === "linkedin") {
    return <svg className={`${className} text-blue-400`} viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286ZM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065Zm1.782 13.019H3.555V9h3.564v11.452ZM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003Z" /></svg>;
  }
  return <span className="text-xs text-white/40">{providerLabel(provider)}</span>;
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

function getStoredThumbnailUrl(thumbnailPath: string | null | undefined) {
  if (!thumbnailPath) return null;
  const bucket = process.env.NEXT_PUBLIC_UPLOADS_BUCKET || process.env.NEXT_PUBLIC_STORAGE_BUCKET || "clips";
  const { data } = supabase.storage.from(bucket).getPublicUrl(thumbnailPath);
  return data?.publicUrl || null;
}

export default function ScheduledPage() {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [canceling, setCanceling] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const teamIdRef = useRef<string | null>(null);
  // Maps post id → status so we can detect both completions and new failures
  const knownStatusRef = useRef<Map<string, string>>(new Map());
  const initializedRef = useRef(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string, type: "success" | "error" = "success") {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 5000);
  }

  async function fetchPosts() {
    if (!teamIdRef.current) return;
    const { data } = await supabase
      .from("scheduled_posts")
      .select("id, title, description, provider, scheduled_for, status, created_at, last_error, group_id, thumbnail_path")
      .eq("team_id", teamIdRef.current)
      .in("status", ["scheduled", "posting", "ig_processing", "failed"])
      .order("scheduled_for", { ascending: true });

    const newPosts = data ?? [];
    const newStatusMap = new Map(newPosts.map((p) => [p.id, p.status]));

    if (initializedRef.current) {
      // Posts that left the active list entirely → published
      const completedCount = [...knownStatusRef.current.keys()].filter(
        (id) => !newStatusMap.has(id)
      ).length;
      if (completedCount > 0) {
        showToast(
          `${completedCount} post${completedCount > 1 ? "s" : ""} published successfully!`,
          "success"
        );
      }

      // Posts that transitioned to "failed" since the last poll
      const newlyFailed = newPosts.filter(
        (p) => p.status === "failed" && knownStatusRef.current.get(p.id) !== "failed"
      );
      if (newlyFailed.length > 0) {
        showToast(
          `${newlyFailed.length} post${newlyFailed.length > 1 ? "s" : ""} failed to publish`,
          "error"
        );
      }
    }

    initializedRef.current = true;
    knownStatusRef.current = newStatusMap;
    setPosts(newPosts);
  }

  useEffect(() => {
    let cancelled = false;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    async function init() {
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) {
        window.location.href = "/login";
        return;
      }

      setSessionEmail(auth.session.user.email ?? null);

      const token = auth.session.access_token;
      try {
        const res = await fetch("/api/team/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (json.ok) teamIdRef.current = json.teamId;
      } catch {}

      if (!teamIdRef.current || cancelled) {
        setLoading(false);
        return;
      }

      await fetchPosts();
      if (!cancelled) {
        setLoading(false);
        // Poll every 5 s to catch completions; skip when tab is hidden
        pollInterval = setInterval(() => {
          if (!cancelled && document.visibilityState === "visible") fetchPosts();
        }, 5000);
      }
    }

    init();

    return () => {
      cancelled = true;
      if (pollInterval) clearInterval(pollInterval);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
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
      setPosts((prev) => {
        const updated = prev.filter((p) => !postIds.includes(p.id));
        // Keep knownStatusRef in sync so cancelled posts don't fire a "published" toast
        knownStatusRef.current = new Map(updated.map((p) => [p.id, p.status]));
        return updated;
      });
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
                <div className="col-span-5">Title</div>
                <div className="col-span-3">Platforms</div>
                <div className="col-span-3">Scheduled</div>
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
                        <div className="min-w-0 md:col-span-5">
                          <div className="flex items-center gap-3 min-w-0">
                            {(() => {
                              const thumb = group.posts.map((p) => getStoredThumbnailUrl(p.thumbnail_path)).find(Boolean) || null;
                              return thumb ? (
                                <img src={thumb} alt={group.title || "Scheduled thumbnail"} className="h-10 w-16 rounded-md object-cover border border-white/10 shrink-0" />
                              ) : (
                                <div className="h-10 w-16 rounded-md border border-white/10 bg-white/[0.03] shrink-0" />
                              );
                            })()}
                            <div className="min-w-0">
                              <p className="truncate font-medium text-white">{group.title || "Untitled"}</p>
                              {group.description ? <p className="mt-1 line-clamp-1 text-xs text-white/40">{group.description}</p> : null}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 md:col-span-3">
                          {group.posts.map((post) => (
                            <span
                              key={post.id}
                              className="inline-flex"
                              title={`${providerLabel(post.provider)}: ${post.status}${post.last_error ? ` - ${post.last_error}` : ""}`}
                            >
                              <ProviderIcon provider={post.provider} className="w-5 h-5" />
                            </span>
                          ))}
                        </div>

                        <div className="md:col-span-3">
                          <span className="text-xs tabular-nums text-white/40">
                            {formatDate(group.scheduled_for)}, {formatTime(group.scheduled_for)}
                          </span>
                          <span className={`block mt-1 text-xs font-semibold tabular-nums ${statusInfo.color} ${statusInfo.pulse ? "animate-pulse" : ""}`}>
                            {statusInfo.text}
                          </span>
                          {hasFailed ? (
                            <p className="mt-1 text-xs text-red-400/80">
                              {failedPostIds.length === group.posts.length
                                ? group.posts.find((p) => p.last_error)?.last_error || "Upload failed"
                                : `Failed on ${group.posts.filter((p) => p.status === "failed").map((p) => providerLabel(p.provider)).join(", ")}`}
                            </p>
                          ) : null}
                        </div>

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
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Live update toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm shadow-xl backdrop-blur-xl transition-all ${
            toast.type === "error"
              ? "border-red-500/30 bg-red-500/10 text-red-300"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          }`}
        >
          {toast.type === "error" ? (
            <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          ) : (
            <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          )}
          {toast.msg}
        </div>
      )}
    </main>
  );
}
