"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/login/supabaseClient";

type DraftPost = {
  id: string;
  title: string | null;
  description: string | null;
  provider: string | null;
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

function providerLabel(provider: string | null) {
  if (!provider) return "No platform";
  const labels: Record<string, string> = {
    youtube: "YouTube",
    tiktok: "TikTok",
    instagram: "Instagram",
    x: "X",
    facebook: "Facebook",
  };
  return labels[provider.toLowerCase()] || provider;
}

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<DraftPost[]>([]);
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
        .select("id, title, description, provider, created_at")
        .eq("team_id", teamId)
        .eq("status", "draft")
        .order("created_at", { ascending: false });

      setDrafts(data ?? []);
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
              <h1 className="text-lg font-semibold tracking-tight">Drafts</h1>
              <p className="text-sm text-white/40">
                {loading ? "Loading..." : `${drafts.length} draft${drafts.length === 1 ? "" : "s"} saved`}
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

        {/* Drafts */}
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
          ) : drafts.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-16 text-center">
              <div className="inline-flex rounded-xl p-3 bg-amber-500/10 text-amber-400 mx-auto">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                </svg>
              </div>
              <p className="font-semibold text-white/90 mt-4">No drafts</p>
              <p className="text-sm text-white/40 mt-1">Upload a video and save it as a draft to finish later.</p>
              <Link
                href="/upload"
                className="inline-flex mt-5 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black hover:bg-white/90 transition-colors"
              >
                Upload a video
              </Link>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] divide-y divide-white/5">
              {drafts.map((draft) => (
                <div
                  key={draft.id}
                  className="px-5 py-4 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-white/90 truncate">
                        {draft.title || "Untitled draft"}
                      </p>
                    </div>

                    <span className="shrink-0 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-400 border border-amber-500/20">
                      {providerLabel(draft.provider)}
                    </span>

                    <span className="shrink-0 text-xs text-white/30 tabular-nums hidden sm:block">
                      {formatDate(draft.created_at)}
                    </span>

                    <button className="shrink-0 flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/50 hover:text-white/80 hover:bg-white/10 transition-all">
                      Edit
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </button>
                  </div>
                  {draft.description && (
                    <p className="text-xs text-white/30 mt-1 line-clamp-1">
                      {draft.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
