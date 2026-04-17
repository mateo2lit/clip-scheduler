"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/login/supabaseClient";
import { CaretLeft, Clock, PencilSimple, Warning, CheckCircle, FilmSlate } from "@phosphor-icons/react/dist/ssr";

type ScheduledPost = {
  id: string;
  title: string | null;
  description: string | null;
  provider: string | null;
  scheduled_for: string;
  status: string;
  created_at: string;
  last_error: string | null;
  group_id: string | null;
  thumbnail_path?: string | null;
};

type PostGroup = {
  groupId: string;
  title: string | null;
  description: string | null;
  scheduled_for: string;
  posts: ScheduledPost[];
  groupStatus: "scheduled" | "posting" | "failed" | "partial_failure";
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

function formatTime(iso: string) {
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

function getRelativeTime(iso: string) {
  const now = new Date();
  const target = new Date(iso);
  const diffMs = target.getTime() - now.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMs < 0) return "Posting soon\u2026";
  if (diffHours < 1) return "< 1 hr";
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 7) return `${diffDays}d`;
  return formatDate(iso);
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

function computeGroupStatus(posts: ScheduledPost[]): PostGroup["groupStatus"] {
  const allFailed = posts.every((p) => p.status === "failed");
  const anyFailed = posts.some((p) => p.status === "failed");
  const anyPosting = posts.some((p) => p.status === "posting" || p.status === "ig_processing");

  if (allFailed) return "failed";
  if (anyFailed) return "partial_failure";
  if (anyPosting) return "posting";
  return "scheduled";
}

function groupPosts(posts: ScheduledPost[]): PostGroup[] {
  const groups = new Map<string, ScheduledPost[]>();

  for (const post of posts) {
    const key = post.group_id || post.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(post);
  }

  return Array.from(groups.entries()).map(([groupId, groupPosts]) => ({
    groupId,
    title: groupPosts[0].title,
    description: groupPosts[0].description,
    scheduled_for: groupPosts[0].scheduled_for,
    posts: groupPosts,
    groupStatus: computeGroupStatus(groupPosts),
  }));
}

function getGroupStatusDisplay(group: PostGroup) {
  if (group.groupStatus === "failed") {
    return { text: "Failed", color: "text-red-400", pulse: false };
  }
  if (group.groupStatus === "partial_failure") {
    const failedPlatforms = group.posts.filter((p) => p.status === "failed").map((p) => providerLabel(p.provider));
    return { text: `Failed: ${failedPlatforms.join(", ")}`, color: "text-red-400", pulse: false };
  }
  if (group.groupStatus === "posting") {
    return { text: "Posting\u2026", color: "text-amber-400", pulse: true };
  }
  const diffMs = new Date(group.scheduled_for).getTime() - Date.now();
  if (diffMs < 0) {
    return { text: "Posting soon\u2026", color: "text-amber-400", pulse: false };
  }
  return { text: getRelativeTime(group.scheduled_for), color: "text-blue-400", pulse: false };
}

function PostingBar({ intensity = "strong" }: { intensity?: "strong" | "soft" }) {
  return (
    <div className={`h-[3px] w-full overflow-hidden rounded-b-2xl ${intensity === "strong" ? "bg-amber-500/10" : "bg-amber-500/[0.05]"}`}>
      <div
        className={`h-full w-1/2 rounded-full ${intensity === "strong" ? "bg-gradient-to-r from-transparent via-amber-400/90 to-transparent" : "bg-gradient-to-r from-transparent via-amber-400/40 to-transparent"}`}
        style={{ animation: "postingSlide 1.6s ease-in-out infinite" }}
      />
    </div>
  );
}

function getStoredThumbnailUrl(thumbnailPath: string | null | undefined) {
  if (!thumbnailPath) return null;
  const bucket = process.env.NEXT_PUBLIC_UPLOADS_BUCKET || process.env.NEXT_PUBLIC_STORAGE_BUCKET || "clips";
  const { data } = supabase.storage.from(bucket).getPublicUrl(thumbnailPath);
  return data?.publicUrl || null;
}

function getScheduledGroupLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((targetDay.getTime() - nowDay.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "Posting Soon";
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function ScheduledThumbnail({ group }: { group: PostGroup }) {
  const thumb = group.posts.map((p) => getStoredThumbnailUrl(p.thumbnail_path)).find(Boolean) || null;
  const primaryProvider = group.posts[0]?.provider?.toLowerCase() ?? null;
  const cls = "h-[72px] w-[128px] shrink-0 rounded-xl object-cover border border-white/[0.08]";
  const placeholder = "h-[72px] w-[128px] shrink-0 rounded-xl border border-white/[0.08] bg-white/[0.03] flex items-center justify-center";
  if (thumb) {
    return <img src={thumb} alt={group.title || "Thumbnail"} className={cls} />;
  }
  const iconMap: Record<string, JSX.Element> = {
    youtube: <svg className="w-6 h-6 text-red-400/40" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814ZM9.545 15.568V8.432L15.818 12l-6.273 3.568Z" /></svg>,
    instagram: <svg className="w-6 h-6 text-pink-400/40" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069ZM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0Zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881Z" /></svg>,
    facebook: <svg className="w-6 h-6 text-blue-400/40" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073Z" /></svg>,
    tiktok: <svg className="w-5 h-5 text-white/25" viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07Z" /></svg>,
  };
  return (
    <div className={placeholder}>
      {iconMap[primaryProvider ?? ""] ?? (
        <FilmSlate className="w-5 h-5 text-white/20" weight="duotone" />
      )}
    </div>
  );
}

export default function ScheduledPage() {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [canceling, setCanceling] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState({ title: "", description: "", scheduledFor: "" });
  const [editSaving, setEditSaving] = useState(false);

  const teamIdRef = useRef<string | null>(null);
  const knownStatusRef = useRef<Map<string, string>>(new Map());
  const initializedRef = useRef(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string, type: "success" | "error" = "success") {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 5000);
  }

  async function fetchPosts() {
    if (!teamIdRef.current) return;
    const { data } = await supabase
      .from("scheduled_posts")
      .select("id, title, description, provider, scheduled_for, status, created_at, last_error, group_id, thumbnail_path")
      .eq("team_id", teamIdRef.current)
      .in("status", ["scheduled", "posting", "ig_processing", "failed"])
      .order("scheduled_for", { ascending: true });

    const newPosts = data ?? [];
    const newStatusMap = new Map(newPosts.map((p) => [p.id, p.status]));

    if (initializedRef.current) {
      const completedCount = [...knownStatusRef.current.keys()].filter(
        (id) => !newStatusMap.has(id)
      ).length;
      if (completedCount > 0) {
        showToast(
          `${completedCount} post${completedCount > 1 ? "s" : ""} published successfully!`,
          "success"
        );
      }

      const newlyFailed = newPosts.filter(
        (p) => p.status === "failed" && knownStatusRef.current.get(p.id) !== "failed"
      );
      if (newlyFailed.length > 0) {
        showToast(
          `${newlyFailed.length} post${newlyFailed.length > 1 ? "s" : ""} failed to publish`,
          "error"
        );
      }
    }

    initializedRef.current = true;
    knownStatusRef.current = newStatusMap;
    setPosts(newPosts);
  }

  useEffect(() => {
    let cancelled = false;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    async function init() {
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) {
        window.location.href = "/login";
        return;
      }

      setSessionEmail(auth.session.user.email ?? null);

      const token = auth.session.access_token;
      try {
        const res = await fetch("/api/team/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (json.ok) teamIdRef.current = json.teamId;
      } catch {}

      if (!teamIdRef.current || cancelled) {
        setLoading(false);
        return;
      }

      await fetchPosts();
      if (!cancelled) {
        setLoading(false);
        pollInterval = setInterval(() => {
          if (!cancelled && document.visibilityState === "visible") fetchPosts();
        }, 5000);
      }
    }

    init();

    return () => {
      cancelled = true;
      if (pollInterval) clearInterval(pollInterval);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const groups = groupPosts(posts);

  async function handleRetry(groupId: string, postIds: string[]) {
    setRetrying(groupId);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Not logged in");

      await Promise.all(postIds.map(postId =>
        fetch(`/api/scheduled-posts/${postId}/retry`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
        }).then(async res => {
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(j.error || `Retry failed (${res.status})`);
          }
        })
      ));

      setPosts((prev) =>
        prev.map((p) =>
          postIds.includes(p.id) ? { ...p, status: "scheduled", last_error: null } : p
        )
      );
    } catch (e: any) {
      alert(e?.message || "Failed to retry");
    } finally {
      setRetrying(null);
    }
  }

  async function handleCancel(groupId: string, postIds: string[]) {
    if (!confirm(`Cancel ${postIds.length > 1 ? "these scheduled posts" : "this scheduled post"}?`)) return;
    setCanceling(groupId);
    try {
      for (const postId of postIds) {
        const { error } = await supabase
          .from("scheduled_posts")
          .delete()
          .eq("id", postId);
        if (error) throw error;
      }
      setPosts((prev) => {
        const updated = prev.filter((p) => !postIds.includes(p.id));
        knownStatusRef.current = new Map(updated.map((p) => [p.id, p.status]));
        return updated;
      });
    } catch (e: any) {
      alert(e?.message || "Failed to cancel");
    } finally {
      setCanceling(null);
    }
  }

  function handleStartEdit(group: PostGroup) {
    const d = new Date(group.scheduled_for);
    const pad = (n: number) => String(n).padStart(2, "0");
    const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setEditFields({ title: group.title || "", description: group.description || "", scheduledFor: local });
    setEditingGroupId(group.groupId);
  }

  async function handleSaveEdit(group: PostGroup) {
    setEditSaving(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Not logged in");

      const scheduledForIso = editFields.scheduledFor ? new Date(editFields.scheduledFor).toISOString() : undefined;

      for (const post of group.posts) {
        if (post.status !== "scheduled") continue;
        const res = await fetch(`/api/scheduled-posts/${post.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            title: editFields.title || null,
            description: editFields.description || null,
            scheduled_for: scheduledForIso,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          throw new Error(j?.error || "Failed to update");
        }
      }

      await fetchPosts();
      setEditingGroupId(null);
      showToast("Post updated", "success");
    } catch (e: any) {
      showToast(e?.message || "Update failed", "error");
    } finally {
      setEditSaving(false);
    }
  }

  const failedGroups = groups.filter((g) => g.groupStatus === "failed" || g.groupStatus === "partial_failure").length;
  const platformCount = new Set(groups.flatMap((g) => g.posts.map((p) => p.provider || "unknown"))).size;

  // Group by date label
  const byDate: { label: string; groups: PostGroup[] }[] = [];
  for (const group of groups) {
    const label = getScheduledGroupLabel(group.scheduled_for);
    const existing = byDate.find((d) => d.label === label);
    if (existing) existing.groups.push(group);
    else byDate.push({ label, groups: [group] });
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050505] text-white">
      <nav className="relative z-10 border-b border-white/5">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center"><img src="/logo.svg" alt="Clip Dash" className="h-10 w-auto" /></Link>
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
            <span className="rounded-full border border-blue-400/30 bg-blue-400/10 px-3 py-1 font-medium text-blue-300">Queue</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-medium text-white/60">Scheduled</span>
          </div>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3">
              <Link
                href="/dashboard"
                className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/40 transition-all hover:bg-white/10 hover:text-white/70"
              >
                <CaretLeft className="h-4 w-4" weight="bold" />
              </Link>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Scheduled Posts</h1>
                <p className="mt-2 text-sm text-white/70 sm:text-base">
                  {loading ? "Loading queue..." : `${groups.length} post${groups.length === 1 ? "" : "s"} lined up to publish automatically.`}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/calendar" className="rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/70 transition-colors hover:bg-white/10">
                Calendar
              </Link>
              <Link href="/upload" className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-white/90">
                New upload
              </Link>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-white/40">Queued</p>
              <p className="mt-1 text-2xl font-semibold text-white">{loading ? "..." : groups.length}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-white/40">Platforms Active</p>
              <p className="mt-1 text-2xl font-semibold text-blue-300">{loading ? "..." : platformCount}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <p className="text-xs uppercase tracking-wider text-white/40">Needs Attention</p>
              <p className="mt-1 text-2xl font-semibold text-amber-300">{loading ? "..." : failedGroups}</p>
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
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-400/[0.08]">
              <Clock className="h-5 w-5 text-blue-400" weight="duotone" />
            </div>
            <p className="font-semibold text-white">No scheduled posts</p>
            <p className="mt-1.5 max-w-xs text-sm text-white/40">Upload a video and choose a publish time to populate your queue.</p>
            <Link href="/upload" className="mt-6 rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white/80">
              Upload your first video
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {byDate.map(({ label, groups: dateGroups }) => (
              <div key={label}>
                <div className="mb-3 flex items-center gap-3">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/30">{label}</span>
                  <div className="h-px flex-1 bg-white/[0.06]" />
                  <span className="text-[11px] text-white/20">{dateGroups.length}</span>
                </div>
                <div className="space-y-2">
                  {dateGroups.map((group) => {
                    const statusInfo = getGroupStatusDisplay(group);
                    const allPostIds = group.posts.map((p) => p.id);
                    const failedPostIds = group.posts.filter((p) => p.status === "failed").map((p) => p.id);
                    const hasFailed = failedPostIds.length > 0;
                    const isEditing = editingGroupId === group.groupId;
                    const isFailed = group.groupStatus === "failed" || group.groupStatus === "partial_failure";
                    const isPosting = group.groupStatus === "posting";
                    const isPostingSoon = group.groupStatus === "scheduled" && new Date(group.scheduled_for) < new Date();

                    return (
                      <div
                        key={group.groupId}
                        className={`rounded-2xl border transition-all overflow-hidden ${
                          isFailed
                            ? "border-red-500/20 bg-red-500/[0.03] hover:border-red-500/30"
                            : isPosting
                            ? "border-amber-500/30 bg-amber-500/[0.03] shadow-[0_0_24px_rgba(245,158,11,0.06)]"
                            : isPostingSoon
                            ? "border-amber-500/15 bg-amber-500/[0.015]"
                            : "border-white/[0.07] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.035]"
                        }`}
                      >
                        {isEditing && (
                          <div className="border-b border-white/[0.06] p-4">
                            <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.04] p-4 space-y-3">
                              <p className="text-xs font-medium uppercase tracking-wider text-blue-300/70">Edit Post</p>
                              <div>
                                <label className="block text-xs text-white/40 mb-1">Title</label>
                                <input
                                  type="text"
                                  value={editFields.title}
                                  onChange={(e) => setEditFields((f) => ({ ...f, title: e.target.value }))}
                                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-blue-500/40 focus:outline-none"
                                  placeholder="Post title"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-white/40 mb-1">Description</label>
                                <textarea
                                  value={editFields.description}
                                  onChange={(e) => setEditFields((f) => ({ ...f, description: e.target.value }))}
                                  rows={3}
                                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-blue-500/40 focus:outline-none resize-none"
                                  placeholder="Post description"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-white/40 mb-1">Schedule Time</label>
                                <input
                                  type="datetime-local"
                                  value={editFields.scheduledFor}
                                  onChange={(e) => setEditFields((f) => ({ ...f, scheduledFor: e.target.value }))}
                                  className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-blue-500/40 focus:outline-none"
                                />
                              </div>
                              <div className="flex gap-2 pt-1">
                                <button
                                  onClick={() => handleSaveEdit(group)}
                                  disabled={editSaving}
                                  className="rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-black hover:bg-white/90 disabled:opacity-50 transition-colors"
                                >
                                  {editSaving ? "Saving..." : "Save"}
                                </button>
                                <button
                                  onClick={() => setEditingGroupId(null)}
                                  className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-white/60 hover:bg-white/10 transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {(isPosting || isPostingSoon) && (
                          <div className={`flex items-center gap-2.5 border-b px-4 py-2.5 ${isPosting ? "border-amber-500/15 bg-amber-500/[0.05]" : "border-amber-500/08 bg-amber-500/[0.025]"}`}>
                            <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${isPosting ? "bg-amber-400/20" : "bg-amber-400/10"}`}>
                              <svg className={`h-3 w-3 text-amber-400 ${isPosting ? "animate-spin" : "animate-pulse"}`} fill="none" viewBox="0 0 24 24">
                                {isPosting
                                  ? <><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></>
                                  : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} stroke="currentColor" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                }
                              </svg>
                            </div>
                            <span className={`text-xs font-medium ${isPosting ? "text-amber-300" : "text-amber-300/70"}`}>
                              {isPosting ? "Uploading to platforms…" : "Posting soon — worker starting up…"}
                            </span>
                            {isPosting && (
                              <div className="ml-auto flex gap-1">
                                {group.posts.filter((p) => p.status === "posting" || p.status === "ig_processing").map((p) => (
                                  <span key={p.id} className="flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">
                                    <ProviderIcon provider={p.provider} className="w-2.5 h-2.5" />
                                    {providerLabel(p.provider)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex items-start gap-4 p-4">
                          <ScheduledThumbnail group={group} />

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-medium text-white/90">{group.title || "Untitled"}</p>
                                {group.description && (
                                  <p className="mt-0.5 line-clamp-1 text-xs text-white/35">{group.description}</p>
                                )}
                              </div>
                              <div className="shrink-0 text-right">
                                <p className={`text-xs font-medium ${statusInfo.color} ${statusInfo.pulse ? "animate-pulse" : ""}`}>
                                  {statusInfo.text}
                                </p>
                                <p className="mt-0.5 text-[11px] text-white/20">
                                  {formatDate(group.scheduled_for)}, {formatTime(group.scheduled_for)}
                                </p>
                              </div>
                            </div>

                            {hasFailed && group.posts.find((p) => p.last_error) && (
                              <p className="mt-1.5 text-xs text-red-400/70">
                                {group.posts.filter((p) => p.status === "failed" && p.last_error).map((p) => p.last_error).join("; ")}
                              </p>
                            )}

                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap gap-1.5">
                                {group.posts.map((post) => (
                                  <span
                                    key={post.id}
                                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                                      post.status === "failed"
                                        ? "border-red-500/30 bg-red-500/10 text-red-300"
                                        : post.status === "posting" || post.status === "ig_processing"
                                        ? "border-amber-500/30 bg-amber-500/10 text-amber-300 animate-pulse"
                                        : "border-white/[0.12] bg-white/[0.05] text-white/60"
                                    }`}
                                    title={`${providerLabel(post.provider)}: ${post.status}${post.last_error ? ` — ${post.last_error}` : ""}`}
                                  >
                                    <ProviderIcon provider={post.provider} className="w-3 h-3" />
                                    {providerLabel(post.provider)}
                                  </span>
                                ))}
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {group.groupStatus === "scheduled" && !isEditing && (
                                  <button
                                    onClick={() => handleStartEdit(group)}
                                    title="Edit post"
                                    className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-white/50 hover:bg-white/10 hover:text-white/80 transition-colors"
                                  >
                                    <PencilSimple className="w-3 h-3" weight="bold" />
                                    Edit
                                  </button>
                                )}
                                {hasFailed && (
                                  <button
                                    onClick={() => handleRetry(group.groupId, failedPostIds)}
                                    disabled={retrying === group.groupId}
                                    className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-white/60 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
                                  >
                                    {retrying === group.groupId ? "Retrying..." : "Retry"}
                                  </button>
                                )}
                                <button
                                  onClick={() => handleCancel(group.groupId, allPostIds)}
                                  disabled={canceling === group.groupId}
                                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                                    hasFailed
                                      ? "border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                                      : "border-white/10 bg-white/5 text-white/50 hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-300"
                                  }`}
                                >
                                  {canceling === group.groupId ? (hasFailed ? "Removing..." : "Canceling...") : hasFailed ? "Remove" : "Cancel"}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                        {(isPosting || isPostingSoon) && (
                          <PostingBar intensity={isPosting ? "strong" : "soft"} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm shadow-xl backdrop-blur-xl transition-all ${
            toast.type === "error"
              ? "border-red-500/30 bg-red-500/10 text-red-300"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          }`}
        >
          {toast.type === "error" ? (
            <Warning className="h-4 w-4 shrink-0" weight="duotone" />
          ) : (
            <CheckCircle className="h-4 w-4 shrink-0" weight="duotone" />
          )}
          {toast.msg}
        </div>
      )}
    </main>
  );
}
