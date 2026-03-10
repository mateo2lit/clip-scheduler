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

function getMonthLabel(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  } catch { return "Unknown"; }
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
    threads: "Threads",
    bluesky: "Bluesky",
  };
  return labels[provider.toLowerCase()] || provider;
}

function ProviderIcon({ provider, className = "w-3 h-3" }: { provider: string | null; className?: string }) {
  const p = provider?.toLowerCase();
  if (p === "youtube") return <svg className={`${className} text-red-400`} viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814ZM9.545 15.568V8.432L15.818 12l-6.273 3.568Z" /></svg>;
  if (p === "facebook") return <svg className={`${className} text-blue-400`} viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073Z" /></svg>;
  if (p === "instagram") return <svg className={`${className} text-pink-400`} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069ZM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0Zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881Z" /></svg>;
  if (p === "tiktok") return <svg className={`${className} text-white/70`} viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07Z" /></svg>;
  if (p === "linkedin") return <svg className={`${className} text-blue-400`} viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286ZM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065Zm1.782 13.019H3.555V9h3.564v11.452ZM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003Z" /></svg>;
  if (p === "threads") return <svg className={`${className} text-white/70`} viewBox="0 0 192 192" fill="currentColor"><path d="M141.537 88.988a66.667 66.667 0 0 0-2.518-1.143c-1.482-27.307-16.403-42.94-41.457-43.1h-.34c-14.986 0-27.449 6.396-35.12 18.036l13.779 9.452c5.738-8.699 14.753-10.548 21.347-10.548h.229c8.249.053 14.474 2.452 18.503 7.129 2.932 3.405 4.893 8.111 5.864 14.05-7.314-1.243-15.224-1.626-23.68-1.14-23.82 1.371-39.134 15.264-38.105 34.568.522 9.792 5.4 18.216 13.735 23.719 6.997 4.67 16.01 6.96 25.379 6.455 12.369-.675 22.047-5.399 28.763-14.041 5.138-6.659 8.373-15.274 9.792-26.074 5.87 3.545 10.216 8.219 12.605 13.982 4.125 9.913 4.357 26.185-8.501 39.063-11.26 11.275-24.817 16.16-45.286 16.307-22.71-.164-39.904-7.489-51.106-21.779C35.928 138.529 30.2 120.9 29.95 98.5c.25-22.401 5.978-40.03 17.02-54.373C58.172 29.836 75.368 22.511 98.076 22.348c22.906.165 40.413 7.531 52.056 21.894 5.668 6.975 9.921 15.717 12.579 25.848l16.152-4.528c-3.29-12.703-8.806-23.758-16.43-32.811C147.386 14.963 125.72 5.18 98.163 5h-.383C70.56 5.18 49.137 14.99 34.393 29.979 20.97 44.12 14.036 64.1 13.786 98.5c.25 34.4 7.184 54.381 20.607 68.521C49.137 182.01 70.56 191.82 97.78 192h.383c24.761-.17 42.251-6.653 56.653-21.079 18.763-18.79 18.168-42.29 12.003-56.723-4.387-10.541-12.904-19.236-25.282-24.21zm-46.941 49.658c-10.426.583-21.24-4.098-21.783-14.082-.407-7.647 5.44-16.17 23.029-17.16 2.016-.115 3.995-.172 5.942-.172 6.377 0 12.358.616 17.771 1.8-2.02 25.214-14.959 28.946-24.959 29.614z"/></svg>;
  if (p === "bluesky") return <svg className={`${className} text-sky-400`} viewBox="0 0 360 320" fill="currentColor"><path d="M180 142c-16.3-31.7-60.7-90.8-102-120C38 2 27.5-2 20 2 10 7.5 10 25.5 10 35V90c0 50 38 65 76 73-38 8-76 23-76 73v55c0 9.5 0 27.5 10 33 7.5 4 18 0 58-20 41.3-29.2 85.7-88.3 102-120zm0 0c16.3-31.7 60.7-90.8 102-120 40-20 50.5-24 58-20 10 5.5 10 23.5 10 33v55c0 50-38 65-76 73 38 8 76 23 76 73v55c0 9.5 0 27.5-10 33-7.5 4-18 0-58-20C240.7 230.8 196.3 171.7 180 142z"/></svg>;
  return <span className="text-[10px] text-white/40">{providerLabel(provider)}</span>;
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

  // Group by month
  const byMonth: { label: string; groups: DraftGroup[] }[] = [];
  for (const group of groups) {
    const label = getMonthLabel(group.created_at);
    const existing = byMonth.find((m) => m.label === label);
    if (existing) existing.groups.push(group);
    else byMonth.push({ label, groups: [group] });
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050505] text-white">
      <div className="pointer-events-none absolute top-0 left-1/2 h-[620px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-b from-blue-500/[0.08] via-purple-500/[0.06] to-transparent blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] rounded-full bg-gradient-to-t from-purple-500/[0.06] to-transparent blur-3xl" />
      <div className="pointer-events-none absolute -top-20 left-[-6rem] h-64 w-64 rounded-full bg-pink-500/[0.05] blur-3xl" />

      <nav className="relative z-10 border-b border-white/5">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center"><img src="/logo.svg" alt="Clip Dash" className="h-12 w-auto" /></Link>
          <div className="flex items-center gap-3">
            <Link href="/settings" className="text-sm text-white/40 transition-colors hover:text-white/70">Settings</Link>
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-[11px] font-semibold">
              {sessionEmail ? sessionEmail[0].toUpperCase() : "?"}
            </div>
          </div>
        </div>
      </nav>

      <div className="relative z-10 mx-auto max-w-5xl px-6 pb-20 pt-10">
        <section className="mb-8 rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-8">
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
                    <div className="h-6 w-16 animate-pulse rounded-full bg-white/[0.04]" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.02] px-6 py-20 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-400/[0.08]">
              <svg className="h-5 w-5 text-amber-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
              </svg>
            </div>
            <p className="font-semibold text-white">No drafts</p>
            <p className="mt-1.5 max-w-xs text-sm text-white/40">Save a draft during scheduling to come back and finish later.</p>
            <Link href="/upload" className="mt-6 rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white/80">
              Upload a video
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {byMonth.map(({ label, groups: monthGroups }) => (
              <div key={label}>
                <div className="mb-3 flex items-center gap-3">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/30">{label}</span>
                  <div className="h-px flex-1 bg-white/[0.06]" />
                  <span className="text-[11px] text-white/20">{monthGroups.length}</span>
                </div>
                <div className="space-y-2">
                  {monthGroups.map((group) => (
                    <div
                      key={group.groupId}
                      className="flex items-start gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 transition-all hover:border-white/[0.12] hover:bg-white/[0.035]"
                    >
                      {/* Draft placeholder icon */}
                      <div className="h-[72px] w-[128px] shrink-0 rounded-xl border border-white/[0.08] bg-white/[0.03] flex items-center justify-center">
                        <svg className="w-5 h-5 text-amber-400/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                        </svg>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-white/90">{group.title || "Untitled draft"}</p>
                            {group.description && (
                              <p className="mt-0.5 line-clamp-1 text-xs text-white/35">{group.description}</p>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-xs text-white/30">{formatDate(group.created_at)}</p>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap gap-1.5">
                            {group.posts.map((draft) => (
                              <span
                                key={draft.id}
                                className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-300"
                              >
                                <ProviderIcon provider={draft.provider} className="w-3 h-3" />
                                {providerLabel(draft.provider)}
                              </span>
                            ))}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {confirmDelete === group.groupId ? (
                              <>
                                <button
                                  onClick={() => handleDelete(group.groupId)}
                                  disabled={deletingIds.has(group.groupId)}
                                  className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-[11px] font-medium text-red-400 transition-all hover:bg-red-500/20 disabled:opacity-50"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => setConfirmDelete(null)}
                                  className="text-[11px] text-white/30 transition-colors hover:text-white/60"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <Link
                                  href={`/uploads?draft=${encodeURIComponent(group.groupId)}`}
                                  className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-white/50 hover:bg-white/10 hover:text-white/80 transition-colors"
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                  </svg>
                                  Edit
                                </Link>
                                <button
                                  onClick={() => setConfirmDelete(group.groupId)}
                                  disabled={deletingIds.has(group.groupId)}
                                  className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 p-1.5 text-white/35 transition-all hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                                  title="Delete draft"
                                >
                                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                  </svg>
                                </button>
                              </>
                            )}
                          </div>
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
