"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/login/supabaseClient";

type Comment = {
  id: string;
  platform: "youtube" | "facebook" | "instagram";
  postTitle: string;
  postId: string;
  authorName: string;
  authorImageUrl: string | null;
  text: string;
  publishedAt: string;
  likeCount: number;
};

type PlatformFilter = "all" | "youtube" | "facebook" | "instagram";

const platformLabels: Record<string, string> = {
  youtube: "YouTube",
  facebook: "Facebook",
  instagram: "Instagram",
};

const platformColors: Record<string, { badge: string; text: string }> = {
  youtube: { badge: "bg-red-500/10 border-red-500/20 text-red-400", text: "text-red-400" },
  facebook: { badge: "bg-blue-500/10 border-blue-500/20 text-blue-400", text: "text-blue-400" },
  instagram: { badge: "bg-pink-500/10 border-pink-500/20 text-pink-400", text: "text-pink-400" },
};

function relativeTime(iso: string) {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return "";
  }
}

export default function CommentsPage() {
  const [comments, setComments] = useState<Comment[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [filter, setFilter] = useState<PlatformFilter>("all");

  useEffect(() => {
    async function load() {
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) {
        window.location.href = "/login";
        return;
      }

      setSessionEmail(auth.session.user.email ?? null);

      const token = auth.session.access_token;

      // Verify team membership
      let teamOk = false;
      try {
        const res = await fetch("/api/team/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (json.ok) teamOk = true;
      } catch {}

      if (!teamOk) {
        setLoading(false);
        return;
      }

      try {
        const res = await fetch("/api/comments", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (json.ok) {
          setComments(json.comments ?? []);
          setErrors(json.errors ?? []);
        }
      } catch {}

      setLoading(false);
    }

    load();
  }, []);

  const filtered = filter === "all" ? comments : comments.filter((c) => c.platform === filter);

  const reconnectErrors = errors.filter((e) => e.toLowerCase().includes("reconnect"));
  const otherErrors = errors.filter((e) => !e.toLowerCase().includes("reconnect"));

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
              <h1 className="text-lg font-semibold tracking-tight">Comments</h1>
              <p className="text-sm text-white/40">
                {loading ? "Loading..." : `${filtered.length} comment${filtered.length === 1 ? "" : "s"}`}
              </p>
            </div>
          </div>
        </div>

        {/* Reconnect banners */}
        {reconnectErrors.map((err, i) => (
          <div
            key={i}
            className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              <span className="text-sm text-amber-300">{err}</span>
            </div>
            <Link
              href="/settings"
              className="shrink-0 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/20 transition-colors"
            >
              Go to Settings
            </Link>
          </div>
        ))}

        {/* Other error banners */}
        {otherErrors.map((err, i) => (
          <div
            key={i}
            className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300"
          >
            {err}
          </div>
        ))}

        {/* Platform filter */}
        <div className="mt-6 flex items-center gap-2">
          {(["all", "youtube", "facebook", "instagram"] as PlatformFilter[]).map((p) => (
            <button
              key={p}
              onClick={() => setFilter(p)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium border transition-all ${
                filter === p
                  ? "bg-white/10 border-white/20 text-white"
                  : "bg-white/[0.02] border-white/10 text-white/40 hover:text-white/60 hover:bg-white/[0.04]"
              }`}
            >
              {p === "all" ? "All" : platformLabels[p]}
            </button>
          ))}
        </div>

        {/* Comments list */}
        <div className="mt-6">
          {loading ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02]">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="px-5 py-4 border-t border-white/5 first:border-t-0">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-white/[0.06] animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-24 rounded bg-white/[0.06] animate-pulse" />
                      <div className="h-3 w-64 rounded bg-white/[0.06] animate-pulse" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-16 text-center">
              <div className="inline-flex rounded-xl p-3 bg-cyan-500/10 text-cyan-400 mx-auto">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                </svg>
              </div>
              <p className="font-semibold text-white/90 mt-4">No comments yet</p>
              <p className="text-sm text-white/40 mt-1">
                Comments on your recent posts will appear here.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] divide-y divide-white/5">
              {filtered.map((comment) => {
                const colors = platformColors[comment.platform];
                return (
                  <div key={comment.id} className="px-5 py-4 hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      {comment.authorImageUrl ? (
                        <img
                          src={comment.authorImageUrl}
                          alt=""
                          className="h-8 w-8 rounded-full shrink-0"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-white/[0.06] flex items-center justify-center text-xs font-semibold text-white/40 shrink-0">
                          {comment.authorName[0]?.toUpperCase() ?? "?"}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-white/90">
                            {comment.authorName}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium border ${colors.badge}`}>
                            {platformLabels[comment.platform]}
                          </span>
                          <span className="text-xs text-white/30">
                            {relativeTime(comment.publishedAt)}
                          </span>
                        </div>

                        <p className="text-sm text-white/70 mt-1 whitespace-pre-line break-words">
                          {comment.text}
                        </p>

                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-xs text-white/30">
                            on &quot;{comment.postTitle}&quot;
                          </span>
                          {comment.likeCount > 0 && (
                            <span className="flex items-center gap-1 text-xs text-white/30">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M2 10.5a1.5 1.5 0 1 1 3 0v6a1.5 1.5 0 0 1-3 0v-6ZM6 10.333v5.43a2 2 0 0 0 1.106 1.79l.05.025A4 4 0 0 0 8.943 18h5.416a2 2 0 0 0 1.962-1.608l1.2-6A2 2 0 0 0 15.56 8H12V4a2 2 0 0 0-2-2 1 1 0 0 0-1 1v.667a4 4 0 0 1-.8 2.4L6.8 7.933a4 4 0 0 0-.8 2.4Z" />
                              </svg>
                              {comment.likeCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
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
