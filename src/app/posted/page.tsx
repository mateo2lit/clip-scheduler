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
  };
  return labels[provider.toLowerCase()] || provider;
}

function getPostUrl(provider: string | null, platformPostId: string | null) {
  if (!platformPostId) return null;
  if (provider === "youtube") {
    return `https://youtube.com/watch?v=${platformPostId}`;
  }
  return null;
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
        .select("id, title, description, provider, scheduled_for, posted_at, platform_post_id, status")
        .eq("team_id", teamId)
        .eq("status", "posted")
        .order("posted_at", { ascending: false });

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
              <h1 className="text-[15px] font-semibold tracking-tight text-white/90">Posted</h1>
              <p className="text-[12px] text-white/35">
                {loading ? "Loading..." : `${posts.length} post${posts.length === 1 ? "" : "s"} published`}
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
              <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center mx-auto">
                <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>
              <p className="text-[14px] font-medium text-white/80 mt-4">No posts yet</p>
              <p className="text-[13px] text-white/35 mt-1">Once your scheduled posts go live, they&apos;ll appear here.</p>
              <Link
                href="/scheduled"
                className="inline-flex mt-5 rounded-lg border border-white/[0.06] bg-white/[0.04] px-5 py-2.5 text-[13px] font-medium text-white/60 hover:bg-white/[0.08] transition-colors"
              >
                View scheduled posts
              </Link>
            </div>
          ) : (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.04]">
              {posts.map((post) => {
                const postUrl = getPostUrl(post.provider, post.platform_post_id);
                return (
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
                      <span className="shrink-0 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                        {providerLabel(post.provider)}
                      </span>

                      {/* Date + time */}
                      <span className="shrink-0 text-[12px] text-white/30 tabular-nums hidden sm:block">
                        {formatDate(post.posted_at)}, {formatTime(post.posted_at)}
                      </span>

                      {/* View link */}
                      {postUrl ? (
                        <a
                          href={postUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 flex items-center gap-1 rounded-md border border-white/[0.06] bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium text-white/50 hover:text-white/80 hover:bg-white/[0.06] transition-all"
                        >
                          View
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                        </a>
                      ) : (
                        <span className="shrink-0 text-[11px] text-white/20">Published</span>
                      )}
                    </div>
                    {post.description && (
                      <p className="text-[12px] text-white/25 mt-1 line-clamp-1">
                        {post.description}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
