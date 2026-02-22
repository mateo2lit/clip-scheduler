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
  group_id: string | null;
};

type DraftGroup = {
  groupId: string;
  title: string | null;
  description: string | null;
  created_at: string;
  posts: DraftPost[];
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
    linkedin: "LinkedIn",
  };
  return labels[provider.toLowerCase()] || provider;
}

function groupDrafts(drafts: DraftPost[]): DraftGroup[] {
  const groups = new Map<string, DraftPost[]>();

  for (const draft of drafts) {
    const key = draft.group_id || draft.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(draft);
  }

  return Array.from(groups.entries()).map(([groupId, groupPosts]) => ({
    groupId,
    title: groupPosts[0].title,
    description: groupPosts[0].description,
    created_at: groupPosts[0].created_at,
    posts: groupPosts,
  }));
}

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<DraftPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) {
        window.location.href = "/login";
        return;
      }

      setSessionEmail(auth.session.user.email ?? null);

      const accessToken = auth.session.access_token;
      setToken(accessToken);
      let teamId: string | null = null;
      try {
        const res = await fetch("/api/team/me", {
          headers: { Authorization: `Bearer ${accessToken}` },
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
        .select("id, title, description, provider, created_at, group_id")
        .eq("team_id", teamId)
        .eq("status", "draft")
        .order("created_at", { ascending: false });

      setDrafts(data ?? []);
      setLoading(false);
    }

    load();
  }, []);

  async function handleDelete(groupId: string) {
    setConfirmDelete(null);
    setDeletingIds((prev) => new Set(prev).add(groupId));
    try {
      const res = await fetch(`/api/scheduled-posts?groupId=${encodeURIComponent(groupId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.ok) {
        setDrafts((prev) => prev.filter((d) => {
          const key = d.group_id || d.id;
          return key !== groupId;
        }));
      }
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(groupId);
        return next;
      });
    }
  }

  const groups = groupDrafts(drafts);
  const platformCount = new Set(groups.flatMap((g) => g.posts.map((p) => p.provider || "none"))).size;
  const withDescription = groups.filter((g) => !!g.description).length;

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
            <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 font-medium text-amber-300">Drafts</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-medium text-white/60">Workspace</span>
          </div>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3">
              <Link href="/dashboard" className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/40 transition-all hover:bg-white/10 hover:text-white/70">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </Link>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Saved Drafts</h1>
                <p className="mt-2 text-sm text-white/70 sm:text-base">
                  {loading ? "Loading drafts..." : `${groups.length} draft${groups.length === 1 ? "" : "s"} ready to finish and schedule.`}
                </p>
              </div>
            </div>
            <Link href="/upload" className="w-fit rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-white/90">
              New upload
            </Link>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-white/40">Drafts</p>
              <p className="mt-1 text-2xl font-semibold text-white">{loading ? "..." : groups.length}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-white/40">Platforms</p>
              <p className="mt-1 text-2xl font-semibold text-blue-300">{loading ? "..." : platformCount}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-white/40">With Description</p>
              <p className="mt-1 text-2xl font-semibold text-amber-300">{loading ? "..." : withDescription}</p>
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
              <div className="mx-auto inline-flex rounded-xl bg-amber-500/10 p-3 text-amber-300">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                </svg>
              </div>
              <p className="mt-4 font-semibold text-white">No drafts</p>
              <p className="mt-1 text-sm text-white/50">Save a draft during scheduling to come back and finish later.</p>
              <Link href="/upload" className="mt-5 inline-flex rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-white/90">
                Upload a video
              </Link>
            </div>
          ) : (
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_70px_rgba(2,6,23,0.45)]">
              <div className="hidden grid-cols-12 gap-3 border-b border-white/10 px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-white/40 md:grid">
                <div className="col-span-5">Title</div>
                <div className="col-span-3">Platforms</div>
                <div className="col-span-2">Saved</div>
                <div className="col-span-2 text-right">Actions</div>
              </div>
              <div className="divide-y divide-white/5">
                {groups.map((group) => (
                  <div key={group.groupId} className="px-5 py-4 transition-colors hover:bg-white/[0.04]">
                    <div className="grid items-center gap-3 md:grid-cols-12">
                      <div className="min-w-0 md:col-span-5">
                        <p className="truncate font-medium text-white">{group.title || "Untitled draft"}</p>
                        {group.description ? <p className="mt-1 line-clamp-1 text-xs text-white/40">{group.description}</p> : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 md:col-span-3">
                        {group.posts.map((draft) => (
                          <span
                            key={draft.id}
                            className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-300"
                          >
                            {providerLabel(draft.provider)}
                          </span>
                        ))}
                      </div>

                      <span className="text-xs tabular-nums text-white/40 md:col-span-2">{formatDate(group.created_at)}</span>

                      <div className="flex items-center gap-2 md:col-span-2 md:justify-end">
                        <Link
                          href={`/uploads?draft=${encodeURIComponent(group.groupId)}`}
                          className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/60 transition-all hover:bg-white/10 hover:text-white"
                        >
                          Edit
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                          </svg>
                        </Link>
                        {confirmDelete === group.groupId ? (
                          <>
                            <button
                              onClick={() => handleDelete(group.groupId)}
                              disabled={deletingIds.has(group.groupId)}
                              className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/15 px-3 py-1 text-xs font-medium text-red-400 transition-all hover:bg-red-500/25 disabled:opacity-50"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="text-xs text-white/30 transition-colors hover:text-white/60"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(group.groupId)}
                            disabled={deletingIds.has(group.groupId)}
                            className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 p-1.5 text-white/40 transition-all hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                            title="Delete draft"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                            </svg>
                          </button>
                        )}
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
