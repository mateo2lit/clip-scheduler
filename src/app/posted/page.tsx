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
      weekday: "short",
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

  useEffect(() => {
    async function load() {
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) {
        window.location.href = "/login";
        return;
      }

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
    <div className="min-h-screen bg-[#050505] text-white">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-neutral-900/50 via-transparent to-transparent" />
      </div>

      <div className="mx-auto max-w-4xl px-6 py-12">
        {/* Header */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-white/40 hover:text-white/70 transition-colors mb-8"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
        </Link>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-medium tracking-tight">Posted</h1>
            <p className="text-white/40 mt-1">
              {loading ? "Loading..." : `${posts.length} post${posts.length === 1 ? "" : "s"} published`}
            </p>
          </div>

          <Link
            href="/upload"
            className="rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black hover:bg-white/90 transition-colors"
          >
            + New upload
          </Link>
        </div>

        {/* Posts List */}
        <div className="mt-10">
          {loading ? (
            <div className="text-center py-20 text-white/40">Loading posted content...</div>
          ) : posts.length === 0 ? (
            <div className="text-center py-20">
              <div className="rounded-full bg-emerald-500/10 p-4 w-fit mx-auto mb-4">
                <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-white/90">No posts yet</h3>
              <p className="text-white/40 mt-1">Once your scheduled posts go live, they'll appear here.</p>
              <Link
                href="/scheduled"
                className="inline-flex mt-6 rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm text-white/70 hover:bg-white/10 transition-colors"
              >
                View scheduled posts
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {posts.map((post) => {
                const postUrl = getPostUrl(post.provider, post.platform_post_id);
                return (
                  <div
                    key={post.id}
                    className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 hover:bg-white/[0.04] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium text-white/90 truncate">
                          {post.title || "Untitled"}
                        </h3>
                        {post.description && (
                          <p className="text-sm text-white/40 mt-1 line-clamp-2">
                            {post.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-3">
                          <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-400 border border-emerald-500/20">
                            {providerLabel(post.provider)}
                          </span>
                          <span className="text-xs text-white/30">
                            Posted {formatDate(post.posted_at)} at {formatTime(post.posted_at)}
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0">
                        {postUrl ? (
                          <a
                            href={postUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                          >
                            View
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        ) : (
                          <span className="text-xs text-white/30">Published</span>
                        )}
                      </div>
                    </div>
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
