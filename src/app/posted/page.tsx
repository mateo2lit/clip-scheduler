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
  thumbnail_path?: string | null;
  privacy_status?: string | null;
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

function ProviderIcon({ provider, className = "w-5 h-5" }: { provider: string | null; className?: string }) {
  const p = provider?.toLowerCase();
  if (p === "youtube") {
    return (
      <svg className={`${className} text-red-500`} viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814ZM9.545 15.568V8.432L15.818 12l-6.273 3.568Z" />
      </svg>
    );
  }
  if (p === "facebook") {
    return (
      <svg className={`${className} text-blue-500`} viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073Z" />
      </svg>
    );
  }
  if (p === "instagram") {
    return (
      <svg className={`${className} text-pink-500`} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069ZM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0Zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881Z" />
      </svg>
    );
  }
  if (p === "tiktok") {
    return (
      <svg className={`${className} text-white`} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07Z" />
      </svg>
    );
  }
  if (p === "linkedin") {
    return (
      <svg className={`${className} text-blue-400`} viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286ZM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065Zm1.782 13.019H3.555V9h3.564v11.452ZM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003Z" />
      </svg>
    );
  }
  return <span className="text-xs text-white/40">{providerLabel(provider)}</span>;
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

function getStoredThumbnailUrl(thumbnailPath: string | null | undefined) {
  if (!thumbnailPath) return null;
  const bucket = process.env.NEXT_PUBLIC_UPLOADS_BUCKET || process.env.NEXT_PUBLIC_STORAGE_BUCKET || "clips";
  const { data } = supabase.storage.from(bucket).getPublicUrl(thumbnailPath);
  return data?.publicUrl || null;
}

function getPostThumbnailUrl(post: PostedPost): string | null {
  const stored = getStoredThumbnailUrl(post.thumbnail_path);
  if (stored) return stored;
  if (post.provider === "youtube" && post.platform_post_id) {
    return `https://i.ytimg.com/vi/${post.platform_post_id}/mqdefault.jpg`;
  }
  return null;
}

function getYouTubeThumbnailCandidates(videoId: string): string[] {
  return [
    `https://i.ytimg.com/vi_webp/${videoId}/maxresdefault.webp`,
    `https://i.ytimg.com/vi_webp/${videoId}/hqdefault.webp`,
    `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
  ];
}

function PostThumbnail({ group }: { group: PostGroup }) {
  const firstWithThumb = group.posts.find((p) => !!p.thumbnail_path) ?? null;
  const firstYouTube = group.posts.find((p) => p.provider === "youtube" && !!p.platform_post_id) ?? null;
  const primaryProvider = group.posts[0]?.provider?.toLowerCase() ?? null;
  const hasYouTube = group.posts.some((p) => p.provider === "youtube");
  const hasPrivateYouTube = group.posts.some(
    (p) => p.provider === "youtube" && (p.privacy_status || "").toLowerCase() === "private"
  );

  const storedThumb = firstWithThumb ? getStoredThumbnailUrl(firstWithThumb.thumbnail_path) : null;
  const ytCandidates = firstYouTube?.platform_post_id
    ? getYouTubeThumbnailCandidates(firstYouTube.platform_post_id)
    : [];

  // For YouTube rows, avoid generic uploaded placeholders and prefer actual YouTube thumbnails.
  const candidates = (hasYouTube ? [...ytCandidates] : [storedThumb, ...ytCandidates]).filter(
    (u): u is string => !!u
  );
  const [idx, setIdx] = useState(0);
  const src = candidates[idx] ?? null;

  if (!src) {
    if (hasYouTube || hasPrivateYouTube) {
      return (
        <div className="h-10 w-16 rounded-md border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.02] shrink-0 flex items-center justify-center">
          <span className="text-[10px] font-semibold tracking-wide text-white/65">PRIVATE</span>
        </div>
      );
    }

    if (primaryProvider === "facebook") {
      return (
        <div className="h-10 w-16 rounded-md border border-white/10 bg-blue-500/10 shrink-0 flex items-center justify-center">
          <svg className="w-7 h-7 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073Z" />
          </svg>
        </div>
      );
    }

    if (primaryProvider === "instagram") {
      return (
        <div className="h-10 w-16 rounded-md border border-white/10 bg-pink-500/10 shrink-0 flex items-center justify-center">
          <svg className="w-7 h-7 text-pink-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069ZM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0Zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881Z" />
          </svg>
        </div>
      );
    }

    if (primaryProvider === "linkedin") {
      return (
        <div className="h-10 w-16 rounded-md border border-white/10 bg-blue-500/10 shrink-0 flex items-center justify-center">
          <svg className="w-7 h-7 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286ZM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065Zm1.782 13.019H3.555V9h3.564v11.452ZM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003Z" />
          </svg>
        </div>
      );
    }

    return (
      <div className="h-10 w-16 rounded-md border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.02] shrink-0 flex items-center justify-center">
        <svg className="w-4 h-4 text-white/40" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H8Zm4 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z" />
        </svg>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={group.title || "Post thumbnail"}
      className="h-10 w-16 rounded-md object-cover border border-white/10 shrink-0"
      onError={() => {
        if (idx < candidates.length - 1) setIdx((v) => v + 1);
      }}
    />
  );
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
        .select("id, title, description, provider, scheduled_for, posted_at, platform_post_id, status, group_id, thumbnail_path, privacy_status")
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
                  <div key={group.groupId} className="px-5 py-4 transition-colors hover:bg-white/[0.04] min-h-[72px] flex items-center">
                    <div className="grid w-full items-center gap-3 md:grid-cols-12">
                      <div className="min-w-0 md:col-span-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <PostThumbnail group={group} />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-white">{group.title || "Untitled"}</p>
                            {group.description ? <p className="mt-1 line-clamp-1 text-xs text-white/40">{group.description}</p> : null}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 md:col-span-3">
                        {group.posts.map((post) => (
                          <span key={post.id} className="inline-flex" title={providerLabel(post.provider)}>
                            <ProviderIcon provider={post.provider} className="w-5 h-5" />
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
                              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/60 transition-all hover:bg-white/10 hover:text-white"
                            >
                              <ProviderIcon provider={post.provider} className="w-3.5 h-3.5" />
                              View on {providerLabel(post.provider)}
                              <svg className="h-3 w-3 text-white/30" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                              </svg>
                            </a>
                          ) : (
                            <span
                              key={post.id}
                              className="flex items-center gap-1.5 rounded-full border border-white/[0.05] bg-white/[0.02] px-3 py-1 text-xs text-white/20"
                            >
                              <ProviderIcon provider={post.provider} className="w-3.5 h-3.5 opacity-30" />
                              No link available
                            </span>
                          );
                        })}
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
