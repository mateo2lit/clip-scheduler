"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/login/supabaseClient";

type PostedPost = {
  id: string;
  title: string | null;
  description: string | null;
  provider: string | null;
  scheduled_for: string;
  posted_at: string | null;
  platform_post_id: string | null;
  status: string;
  group_id: string | null;
};

type PostGroup = {
  groupId: string;
  title: string | null;
  description: string | null;
  posted_at: string | null;
  posts: PostedPost[];
};

function formatDate(iso: string | null) {
  if (!iso) return "Unknown";
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

function formatTime(iso: string | null) {
  if (!iso) return "";
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

function getPostUrl(provider: string | null, platformPostId: string | null) {
  if (!platformPostId) return null;
  if (provider === "youtube") {
    return `https://youtube.com/watch?v=${platformPostId}`;
  }
  if (provider === "facebook") {
    return `https://www.facebook.com/${platformPostId}`;
  }
  if (provider === "linkedin") {
    return `https://www.linkedin.com/feed/update/${platformPostId}`;
  }
  if (provider === "instagram" && platformPostId.startsWith("https://")) {
    return platformPostId;
  }
  return null;
}

function groupPosts(posts: PostedPost[]): PostGroup[] {
  const groups = new Map<string, PostedPost[]>();

  for (const post of posts) {
    const key = post.group_id || post.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(post);
  }

  return Array.from(groups.entries()).map(([groupId, groupPosts]) => ({
    groupId,
    title: groupPosts[0].title,
    description: groupPosts[0].description,
    posted_at: groupPosts[0].posted_at,
    posts: groupPosts,
  }));
}

export default function PostedPage() {
  const [posts, setPosts] = useState<PostedPost[]>([]);
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
        .select("id, title, description, provider, scheduled_for, posted_at, platform_post_id, status, group_id")
        .eq("team_id", teamId)
        .eq("status", "posted")
        .order("posted_at", { ascending: false });

      setPosts(data ?? []);
      setLoading(false);
    }

    load();
  }, []);

  const groups = groupPosts(posts);
  const platformCount = new Set(groups.flatMap((g) => g.posts.map((p) => p.provider || "unknown"))).size;
  const withExternalLinks = groups.filter((g) => g.posts.some((p) => !!getPostUrl(p.provider, p.platform_post_id))).length;

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
            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 font-medium text-emerald-300">Published</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-medium text-white/60">History</span>
          </div>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3">
              <Link href="/dashboard" className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/40 transition-all hover:bg-white/10 hover:text-white/70">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </Link>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Posted Content</h1>
                <p className="mt-2 text-sm text-white/70 sm:text-base">
                  {loading ? "Loading history..." : `${groups.length} post${groups.length === 1 ? "" : "s"} successfully published.`}
                </p>
              </div>
            </div>
            <Link href="/upload" className="w-fit rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-white/90">
              New upload
            </Link>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-white/40">Published</p>
              <p className="mt-1 text-2xl font-semibold text-white">{loading ? "..." : groups.length}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-white/40">Platforms</p>
              <p className="mt-1 text-2xl font-semibold text-blue-300">{loading ? "..." : platformCount}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-white/40">View Links</p>
              <p className="mt-1 text-2xl font-semibold text-emerald-300">{loading ? "..." : withExternalLinks}</p>
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
              <div className="mx-auto inline-flex rounded-xl bg-emerald-500/10 p-3 text-emerald-300">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>
              <p className="mt-4 font-semibold text-white">No posts yet</p>
              <p className="mt-1 text-sm text-white/50">Once scheduled posts go live, they will appear here with links where available.</p>
              <Link href="/scheduled" className="mt-5 inline-flex rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white/70 transition-colors hover:bg-white/10">
                View scheduled posts
              </Link>
            </div>
          ) : (
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_70px_rgba(2,6,23,0.45)]">
              <div className="hidden grid-cols-12 gap-3 border-b border-white/10 px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-white/40 md:grid">
                <div className="col-span-4">Title</div>
                <div className="col-span-3">Platforms</div>
                <div className="col-span-2">Posted</div>
                <div className="col-span-3 text-right">Links</div>
              </div>
              <div className="divide-y divide-white/5">
                {groups.map((group) => (
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
                            className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300"
                          >
                            {providerLabel(post.provider)}
                          </span>
                        ))}
                      </div>

                      <span className="text-xs tabular-nums text-white/40 md:col-span-2">
                        {formatDate(group.posted_at)}, {formatTime(group.posted_at)}
                      </span>

                      <div className="flex flex-wrap items-center justify-start gap-1.5 md:col-span-3 md:justify-end">
                        {group.posts.map((post) => {
                          const postUrl = getPostUrl(post.provider, post.platform_post_id);
                          return postUrl ? (
                            <a
                              key={post.id}
                              href={postUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/60 transition-all hover:bg-white/10 hover:text-white"
                              title={`View on ${providerLabel(post.provider)}`}
                            >
                              View
                              <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                              </svg>
                            </a>
                          ) : null;
                        })}
                        {group.posts.every((p) => !getPostUrl(p.provider, p.platform_post_id)) ? <span className="text-xs text-white/25">Published</span> : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
