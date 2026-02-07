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
  if (!provider) return "No platform selected";
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

  useEffect(() => {
    async function load() {
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) {
        window.location.href = "/login";
        return;
      }

      const { data } = await supabase
        .from("scheduled_posts")
        .select("id, title, description, provider, created_at")
        .eq("status", "draft")
        .order("created_at", { ascending: false });

      setDrafts(data ?? []);
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
            <h1 className="text-2xl font-medium tracking-tight">Drafts</h1>
            <p className="text-white/40 mt-1">
              {loading ? "Loading..." : `${drafts.length} draft${drafts.length === 1 ? "" : "s"} saved`}
            </p>
          </div>

          <Link
            href="/upload"
            className="rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black hover:bg-white/90 transition-colors"
          >
            + New upload
          </Link>
        </div>

        {/* Drafts List */}
        <div className="mt-10">
          {loading ? (
            <div className="text-center py-20 text-white/40">Loading drafts...</div>
          ) : drafts.length === 0 ? (
            <div className="text-center py-20">
              <div className="rounded-full bg-amber-500/10 p-4 w-fit mx-auto mb-4">
                <svg className="w-8 h-8 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-white/90">No drafts</h3>
              <p className="text-white/40 mt-1">Upload a video and save it as a draft to finish later.</p>
              <Link
                href="/upload"
                className="inline-flex mt-6 rounded-full bg-white px-6 py-3 text-sm font-medium text-black hover:bg-white/90 transition-colors"
              >
                Upload a video
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {drafts.map((draft) => (
                <div
                  key={draft.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 hover:bg-white/[0.04] transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium text-white/90 truncate">
                        {draft.title || "Untitled draft"}
                      </h3>
                      {draft.description && (
                        <p className="text-sm text-white/40 mt-1 line-clamp-2">
                          {draft.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-3">
                        <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-1 text-xs text-amber-400 border border-amber-500/20">
                          {providerLabel(draft.provider)}
                        </span>
                        <span className="text-xs text-white/30">
                          Created {formatDate(draft.created_at)}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      <button className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors">
                        Edit
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
