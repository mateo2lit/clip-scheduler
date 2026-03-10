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

function formatRelativeDate(iso: string | null) {
  if (!iso) return "Unknown";
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: diffDays > 365 ? "numeric" : undefined });
  } catch { return iso; }
}

function formatTime(iso: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch { return ""; }
}

function getMonthLabel(iso: string | null) {
  if (!iso) return "Unknown";
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  } catch { return "Unknown"; }
}

function providerLabel(provider: string | null) {
  if (!provider) return "Unknown";
  const labels: Record<string, string> = {
    youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram",
    facebook: "Facebook", linkedin: "LinkedIn", threads: "Threads", bluesky: "Bluesky",
  };
  return labels[provider.toLowerCase()] || provider;
}

function ProviderIcon({ provider, className = "w-4 h-4" }: { provider: string | null; className?: string }) {
  const p = provider?.toLowerCase();
  if (p === "youtube") return <svg className={`${className} text-red-400`} viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814ZM9.545 15.568V8.432L15.818 12l-6.273 3.568Z" /></svg>;
  if (p === "facebook") return <svg className={`${className} text-blue-400`} viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073Z" /></svg>;
  if (p === "instagram") return <svg className={`${className} text-pink-400`} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069ZM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0Zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881Z" /></svg>;
  if (p === "tiktok") return <svg className={`${className} text-white/80`} viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07Z" /></svg>;
  if (p === "linkedin") return <svg className={`${className} text-blue-400`} viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286ZM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065Zm1.782 13.019H3.555V9h3.564v11.452ZM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003Z" /></svg>;
  if (p === "threads") return <svg className={`${className} text-white/70`} viewBox="0 0 24 24" fill="currentColor"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.5 12.068V12c.05-4.073 1.364-7.298 3.905-9.58C7.628.302 10.594-.06 12.186 0c2.64.065 4.955.942 6.681 2.534.94.861 1.696 1.957 2.25 3.258l-2.145.9c-.427-1.012-1.03-1.881-1.793-2.582-1.33-1.218-3.15-1.872-5.053-1.915-1.275-.032-3.6.239-5.392 1.913C4.899 5.69 3.884 8.26 3.84 11.998c.038 3.733 1.053 6.3 3.014 7.847 1.782 1.374 4.107 1.662 5.367 1.682 1.254-.005 3.424-.237 5.25-1.624.926-.71 1.63-1.63 2.09-2.73-1.208-.226-2.457-.285-3.73-.147-2.02.217-3.717-.185-5.04-1.196-.959-.728-1.505-1.833-1.514-2.949-.013-1.208.496-2.372 1.389-3.191 1.083-.994 2.67-1.487 4.712-1.487a11.91 11.91 0 0 1 1.96.164c-.143-.49-.38-.882-.714-1.165-.522-.442-1.329-.667-2.396-.667l-.118.001c-.899.01-2.094.317-2.823 1.218l-1.617-1.38C9.5 7.067 11.083 6.5 12.72 6.5l.156-.001c1.597-.007 2.936.388 3.88 1.168.99.815 1.534 2.016 1.617 3.578.1 1.828-.265 3.382-1.086 4.624-.821 1.241-2.071 2.097-3.617 2.475a10.6 10.6 0 0 1-2.52.296c-2.01-.003-3.41-.55-4.165-1.636-.48-.687-.636-1.504-.49-2.413.215-1.326 1.1-2.477 2.482-3.235 1.028-.565 2.2-.808 3.468-.72.447.03.883.084 1.303.161-.12-.857-.477-1.423-.979-1.694-.545-.292-1.245-.355-1.78-.16-.617.224-1.126.747-1.516 1.555l-1.972-.906c.568-1.24 1.46-2.154 2.643-2.72 1.002-.476 2.123-.616 3.237-.405 1.4.267 2.483 1.038 3.13 2.233.551 1.014.787 2.285.696 3.78a11.72 11.72 0 0 1-.1.99c-.11.762-.286 1.46-.52 2.083 1.58.048 3.121.386 4.573.996-.015.14-.03.278-.046.414-.257 2.155-1.023 3.932-2.278 5.282C17.236 22.803 14.85 23.975 12.186 24z" /></svg>;
  if (p === "bluesky") return <svg className={`${className} text-sky-400`} viewBox="0 0 600 530" fill="currentColor"><path d="m135.72 44.03c66.496 49.921 138.02 151.14 164.28 205.46 26.262-54.316 97.782-155.54 164.28-205.46 47.98-36.021 125.72-63.892 125.72 24.795 0 17.712-10.155 148.79-16.111 170.07-20.703 73.984-96.144 92.854-163.25 81.433 117.3 19.964 147.14 86.092 82.697 152.22-122.39 125.59-175.91-31.511-189.63-71.766-2.514-7.3797-3.6904-10.832-3.7077-7.8964-0.0174-2.9357-1.1937 0.51669-3.7077 7.8964-13.714 40.255-67.233 197.36-189.63 71.766-64.444-66.128-34.605-132.26 82.697-152.22-67.106 11.421-142.55-7.4491-163.25-81.433-5.9562-21.282-16.111-152.36-16.111-170.07 0-88.687 77.742-60.816 125.72-24.795z" /></svg>;
  return <span className="text-[10px] text-white/40">{providerLabel(provider)}</span>;
}

function getPostUrl(provider: string | null, platformPostId: string | null) {
  if (!platformPostId) return null;
  if (provider === "youtube") return `https://youtube.com/watch?v=${platformPostId}`;
  if (provider === "facebook") return `https://www.facebook.com/${platformPostId}`;
  if (provider === "linkedin") return `https://www.linkedin.com/feed/update/${platformPostId}`;
  if (provider === "instagram" && platformPostId.startsWith("https://")) return platformPostId;
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

function getYouTubeThumbnailCandidates(videoId: string): string[] {
  return [
    `https://i.ytimg.com/vi_webp/${videoId}/maxresdefault.webp`,
    `https://i.ytimg.com/vi_webp/${videoId}/hqdefault.webp`,
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
  ];
}

function PostThumbnail({ group }: { group: PostGroup }) {
  const firstWithThumb = group.posts.find((p) => !!p.thumbnail_path) ?? null;
  const firstYouTube = group.posts.find((p) => p.provider === "youtube" && !!p.platform_post_id) ?? null;
  const primaryProvider = group.posts[0]?.provider?.toLowerCase() ?? null;
  const hasYouTube = group.posts.some((p) => p.provider === "youtube");
  const hasPrivateYouTube = group.posts.some((p) => p.provider === "youtube" && (p.privacy_status || "").toLowerCase() === "private");

  const storedThumb = firstWithThumb ? getStoredThumbnailUrl(firstWithThumb.thumbnail_path) : null;
  const ytCandidates = firstYouTube?.platform_post_id ? getYouTubeThumbnailCandidates(firstYouTube.platform_post_id) : [];
  const candidates = (hasYouTube ? [...ytCandidates] : [storedThumb, ...ytCandidates]).filter((u): u is string => !!u);
  const [idx, setIdx] = useState(0);
  const src = candidates[idx] ?? null;

  const cls = "h-[72px] w-[128px] shrink-0 rounded-xl object-cover border border-white/[0.08]";
  const placeholder = "h-[72px] w-[128px] shrink-0 rounded-xl border border-white/[0.08] flex items-center justify-center";

  if (!src) {
    if (hasPrivateYouTube) {
      return <div className={`${placeholder} bg-white/[0.04]`}><span className="text-[9px] font-semibold tracking-widest text-white/30">PRIVATE</span></div>;
    }
    const iconMap: Record<string, JSX.Element> = {
      youtube: <svg className="w-6 h-6 text-red-400/50" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814ZM9.545 15.568V8.432L15.818 12l-6.273 3.568Z" /></svg>,
      instagram: <svg className="w-6 h-6 text-pink-400/50" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069ZM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0Zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881Z" /></svg>,
      facebook: <svg className="w-6 h-6 text-blue-400/50" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073Z" /></svg>,
    };
    return (
      <div className={`${placeholder} bg-white/[0.03]`}>
        {iconMap[primaryProvider ?? ""] ?? <svg className="w-5 h-5 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={group.title || "Post thumbnail"}
      className={cls}
      onError={() => { if (idx < candidates.length - 1) setIdx((v) => v + 1); }}
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
      if (!auth.session) { window.location.href = "/login"; return; }
      setSessionEmail(auth.session.user.email ?? null);

      const token = auth.session.access_token;
      let teamId: string | null = null;
      try {
        const res = await fetch("/api/team/me", { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json();
        if (json.ok) teamId = json.teamId;
      } catch {}

      if (!teamId) { setLoading(false); return; }

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

  // Group by month
  const byMonth: { label: string; groups: PostGroup[] }[] = [];
  for (const group of groups) {
    const label = getMonthLabel(group.posted_at);
    const existing = byMonth.find((m) => m.label === label);
    if (existing) existing.groups.push(group);
    else byMonth.push({ label, groups: [group] });
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050505] text-white">
      {/* Ambient glows */}
      <div className="pointer-events-none absolute top-0 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-gradient-to-b from-emerald-500/[0.06] via-blue-500/[0.04] to-transparent blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-gradient-to-t from-purple-500/[0.05] to-transparent blur-3xl" />

      {/* Nav */}
      <nav className="relative z-10 border-b border-white/[0.06]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center">
            <img src="/logo.svg" alt="Clip Dash" className="h-7 w-auto" />
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/settings" className="text-sm text-white/35 transition-colors hover:text-white/65">Settings</Link>
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-[11px] font-semibold">
              {sessionEmail ? sessionEmail[0].toUpperCase() : "?"}
            </div>
          </div>
        </div>
      </nav>

      <div className="relative z-10 mx-auto max-w-5xl px-6 pb-20 pt-10">

        {/* Page header — matches scheduled page style */}
        <section className="mb-8 rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-8">
          <div className="mb-5 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 font-medium text-emerald-300">Published</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-medium text-white/60">History</span>
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
                <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Posted Content</h1>
                <p className="mt-2 text-sm text-white/70 sm:text-base">
                  {loading ? "Loading history..." : `${groups.length} upload${groups.length === 1 ? "" : "s"} successfully published.`}
                </p>
              </div>
            </div>
            <Link href="/uploads" className="w-fit rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-white/90">
              New upload
            </Link>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-white/40">Published</p>
              <p className="mt-1 text-2xl font-semibold text-white">{loading ? "..." : groups.length}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-white/40">Platforms reached</p>
              <p className="mt-1 text-2xl font-semibold text-blue-300">{loading ? "..." : platformCount}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-white/40">Total posts</p>
              <p className="mt-1 text-2xl font-semibold text-emerald-300">{loading ? "..." : posts.length}</p>
            </div>
          </div>
        </section>

        {/* Content */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="h-[72px] w-[128px] shrink-0 animate-pulse rounded-xl bg-white/[0.05]" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-48 animate-pulse rounded bg-white/[0.06]" />
                  <div className="h-3 w-64 animate-pulse rounded bg-white/[0.04]" />
                  <div className="flex gap-2 pt-1">
                    <div className="h-6 w-20 animate-pulse rounded-full bg-white/[0.04]" />
                    <div className="h-6 w-24 animate-pulse rounded-full bg-white/[0.04]" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.02] px-6 py-20 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.08]">
              <svg className="h-5 w-5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
            <p className="font-semibold text-white">Nothing posted yet</p>
            <p className="mt-1.5 max-w-xs text-sm text-white/40">Once your scheduled posts go live they'll appear here with platform links.</p>
            <Link href="/scheduled" className="mt-6 rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white/80">
              View scheduled posts
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {byMonth.map(({ label, groups: monthGroups }) => (
              <div key={label}>
                {/* Month header */}
                <div className="mb-3 flex items-center gap-3">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/30">{label}</span>
                  <div className="h-px flex-1 bg-white/[0.06]" />
                  <span className="text-[11px] text-white/20">{monthGroups.length}</span>
                </div>

                {/* Cards */}
                <div className="space-y-2">
                  {monthGroups.map((group) => (
                    <div
                      key={group.groupId}
                      className="flex items-start gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 transition-all hover:border-white/[0.12] hover:bg-white/[0.035]"
                    >
                      <PostThumbnail group={group} />

                      <div className="min-w-0 flex-1">
                        {/* Title row */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-white/90">
                              {group.title || "Untitled"}
                            </p>
                            {group.description && (
                              <p className="mt-0.5 line-clamp-1 text-xs text-white/35">{group.description}</p>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-xs font-medium text-white/40">{formatRelativeDate(group.posted_at)}</p>
                            <p className="mt-0.5 text-[11px] text-white/20">{formatTime(group.posted_at)}</p>
                          </div>
                        </div>

                        {/* Platform pills */}
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {group.posts.map((post) => {
                            const url = getPostUrl(post.provider, post.platform_post_id);
                            return url ? (
                              <a
                                key={post.id}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.12] bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-white/60 transition-all hover:border-white/20 hover:bg-white/[0.09] hover:text-white/90"
                              >
                                <ProviderIcon provider={post.provider} className="w-3 h-3" />
                                {providerLabel(post.provider)}
                                <svg className="h-2.5 w-2.5 text-white/30" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                                </svg>
                              </a>
                            ) : (
                              <span
                                key={post.id}
                                className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] px-2.5 py-1 text-[11px] text-white/25"
                              >
                                <ProviderIcon provider={post.provider} className="w-3 h-3 opacity-50" />
                                {providerLabel(post.provider)}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
