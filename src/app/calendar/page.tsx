"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/login/supabaseClient";

type ScheduledPost = {
  id: string;
  title: string | null;
  provider: string | null;
  scheduled_for: string;
  status: string;
  group_id: string | null;
  thumbnail_path?: string | null;
};

type PostGroup = {
  groupId: string;
  title: string | null;
  scheduled_for: string;
  posts: ScheduledPost[];
};

const PROVIDER_COLORS: Record<string, { dot: string; label: string }> = {
  youtube:   { dot: "bg-red-500",    label: "YouTube"   },
  tiktok:    { dot: "bg-white/70",   label: "TikTok"    },
  instagram: { dot: "bg-pink-500",   label: "Instagram" },
  facebook:  { dot: "bg-blue-500",   label: "Facebook"  },
  linkedin:  { dot: "bg-sky-500",    label: "LinkedIn"  },
  bluesky:   { dot: "bg-sky-400",    label: "Bluesky"   },
  threads:   { dot: "bg-white/50",   label: "Threads"   },
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ day: number; date: Date } | null> = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push({ day, date: new Date(year, month, day) });
  const trailing = (7 - (cells.length % 7)) % 7;
  for (let i = 0; i < trailing; i++) cells.push(null);
  return cells;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isToday(date: Date) {
  return isSameDay(date, new Date());
}

function formatTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); }
  catch { return ""; }
}

function formatFullDate(date: Date) {
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function getColor(provider: string | null) {
  return PROVIDER_COLORS[(provider || "").toLowerCase()] || { dot: "bg-white/30", label: provider || "Unknown" };
}

function ProviderIcon({ provider, className = "w-3.5 h-3.5" }: { provider: string | null; className?: string }) {
  const p = (provider || "").toLowerCase();
  if (p === "youtube") return <svg className={`${className} text-red-400`} viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814ZM9.545 15.568V8.432L15.818 12l-6.273 3.568Z" /></svg>;
  if (p === "facebook") return <svg className={`${className} text-blue-400`} viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073Z" /></svg>;
  if (p === "instagram") return <svg className={`${className} text-pink-400`} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069ZM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0Zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881Z" /></svg>;
  if (p === "tiktok") return <svg className={`${className} text-white/70`} viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07Z" /></svg>;
  if (p === "linkedin") return <svg className={`${className} text-blue-400`} viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286ZM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065Zm1.782 13.019H3.555V9h3.564v11.452ZM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003Z" /></svg>;
  if (p === "bluesky") return <svg className={`${className} text-sky-400`} viewBox="0 0 360 320" fill="currentColor"><path d="M180 142c-16.3-31.7-60.7-90.8-102-120C38 2 27.5-2 20 2 10 7.5 10 25.5 10 35V90c0 50 38 65 76 73-38 8-76 23-76 73v55c0 9.5 0 27.5 10 33 7.5 4 18 0 58-20 41.3-29.2 85.7-88.3 102-120zm0 0c16.3-31.7 60.7-90.8 102-120 40-20 50.5-24 58-20 10 5.5 10 23.5 10 33v55c0 50-38 65-76 73 38 8 76 23 76 73v55c0 9.5 0 27.5-10 33-7.5 4-18 0-58-20C240.7 230.8 196.3 171.7 180 142z" /></svg>;
  if (p === "threads") return <svg className={`${className} text-white/60`} viewBox="0 0 24 24" fill="currentColor"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.5 12.068V12c.05-4.073 1.364-7.298 3.905-9.58C7.628.302 10.594-.06 12.186 0c2.64.065 4.955.942 6.681 2.534.94.861 1.696 1.957 2.25 3.258l-2.145.9c-.427-1.012-1.03-1.881-1.793-2.582-1.33-1.218-3.15-1.872-5.053-1.915-1.275-.032-3.6.239-5.392 1.913C4.899 5.69 3.884 8.26 3.84 11.998c.038 3.733 1.053 6.3 3.014 7.847 1.782 1.374 4.107 1.662 5.367 1.682 1.254-.005 3.424-.237 5.25-1.624.926-.71 1.63-1.63 2.09-2.73-1.208-.226-2.457-.285-3.73-.147-2.02.217-3.717-.185-5.04-1.196-.959-.728-1.505-1.833-1.514-2.949-.013-1.208.496-2.372 1.389-3.191 1.083-.994 2.67-1.487 4.712-1.487a11.91 11.91 0 0 1 1.96.164c-.143-.49-.38-.882-.714-1.165-.522-.442-1.329-.667-2.396-.667l-.118.001c-.899.01-2.094.317-2.823 1.218l-1.617-1.38C9.5 7.067 11.083 6.5 12.72 6.5l.156-.001c1.597-.007 2.936.388 3.88 1.168.99.815 1.534 2.016 1.617 3.578.1 1.828-.265 3.382-1.086 4.624-.821 1.241-2.071 2.097-3.617 2.475a10.6 10.6 0 0 1-2.52.296c-2.01-.003-3.41-.55-4.165-1.636-.48-.687-.636-1.504-.49-2.413.215-1.326 1.1-2.477 2.482-3.235 1.028-.565 2.2-.808 3.468-.72.447.03.883.084 1.303.161-.12-.857-.477-1.423-.979-1.694-.545-.292-1.245-.355-1.78-.16-.617.224-1.126.747-1.516 1.555l-1.972-.906c.568-1.24 1.46-2.154 2.643-2.72 1.002-.476 2.123-.616 3.237-.405 1.4.267 2.483 1.038 3.13 2.233.551 1.014.787 2.285.696 3.78a11.72 11.72 0 0 1-.1.99c-.11.762-.286 1.46-.52 2.083 1.58.048 3.121.386 4.573.996-.015.14-.03.278-.046.414-.257 2.155-1.023 3.932-2.278 5.282C17.236 22.803 14.85 23.975 12.186 24z" /></svg>;
  return null;
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
    scheduled_for: groupPosts[0].scheduled_for,
    posts: groupPosts,
  }));
}

const MAX_VISIBLE = 4;

export default function CalendarPage() {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [platformFilter, setPlatformFilter] = useState<string>("all");

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const cells = getMonthDays(viewYear, viewMonth);

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  }

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
        .select("id, title, provider, scheduled_for, status, group_id, thumbnail_path")
        .eq("team_id", teamId)
        .in("status", ["scheduled", "ig_processing", "posted"])
        .order("scheduled_for", { ascending: true });

      setPosts(data ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const allGroups = groupPosts(posts);
  const filteredGroups = allGroups.filter((g) =>
    platformFilter === "all" || g.posts.some((p) => (p.provider || "").toLowerCase() === platformFilter)
  );

  const activePlatforms = [...new Set(allGroups.flatMap((g) => g.posts.map((p) => (p.provider || "").toLowerCase())))].filter(Boolean);

  function getGroupsForDate(date: Date) {
    return filteredGroups.filter((g) => isSameDay(new Date(g.scheduled_for), date));
  }

  const selectedDayGroups = selectedDate
    ? getGroupsForDate(selectedDate).sort((a, b) => new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime())
    : [];

  return (
    <main className="min-h-screen bg-[#050505] text-white relative overflow-hidden">

      {/* Nav */}
      <nav className="relative z-10 border-b border-white/5">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center"><img src="/logo.svg" alt="Clip Dash" className="h-10 w-auto" /></Link>
          <div className="flex items-center gap-3">
            <Link href="/settings" className="text-sm text-white/40 hover:text-white/70 transition-colors">Settings</Link>
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-[11px] font-semibold">
              {sessionEmail ? sessionEmail[0].toUpperCase() : "?"}
            </div>
          </div>
        </div>
      </nav>

      <div className="relative z-10 mx-auto max-w-7xl px-6 pt-8 pb-16">

        {/* Header row */}
        <div className="flex items-center gap-4 mb-6">
          {/* Left: back + title */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Link
              href="/dashboard"
              className="h-8 w-8 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/10 transition-all shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </Link>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Calendar</h1>
              <p className="text-xs text-white/35 mt-0.5">
                {loading ? "Loading..." : `${filteredGroups.length} scheduled`}
              </p>
            </div>
          </div>

          {/* Center: month nav */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={prevMonth}
              className="h-8 w-8 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/50 hover:text-white/80 hover:bg-white/10 transition-all"
              aria-label="Previous month"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <span className="text-base font-semibold whitespace-nowrap min-w-[160px] text-center">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button
              onClick={nextMonth}
              className="h-8 w-8 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/50 hover:text-white/80 hover:bg-white/10 transition-all"
              aria-label="Next month"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2 flex-1 justify-end">
            <Link
              href="/scheduled"
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/60 hover:bg-white/10 transition-colors"
            >
              List view
            </Link>
            <Link
              href="/uploads"
              className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-white/90 transition-colors"
            >
              New upload
            </Link>
          </div>
        </div>

        {/* Platform filter pills */}
        {activePlatforms.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => setPlatformFilter("all")}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                platformFilter === "all"
                  ? "border-white/20 bg-white/10 text-white"
                  : "border-white/[0.08] text-white/40 hover:border-white/15 hover:text-white/60"
              }`}
            >
              All platforms
            </button>
            {activePlatforms.map((key) => {
              const c = getColor(key);
              return (
                <button
                  key={key}
                  onClick={() => setPlatformFilter(key === platformFilter ? "all" : key)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    platformFilter === key
                      ? "border-white/20 bg-white/10 text-white"
                      : "border-white/[0.08] text-white/40 hover:border-white/15 hover:text-white/60"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />
                  {c.label}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex gap-5">
          {/* Calendar grid */}
          <div className="flex-1 min-w-0 rounded-3xl border border-white/[0.08] bg-white/[0.025] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.4)]">
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-white/[0.06]">
              {DAY_NAMES.map((day) => (
                <div key={day} className="px-2 py-3 text-center text-[11px] font-medium text-white/30 uppercase tracking-wider">
                  {day}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7">
              {cells.map((cell, i) => {
                if (!cell) {
                  return (
                    <div
                      key={i}
                      className={`min-h-[120px] border-b border-r border-white/[0.04] bg-transparent ${i % 7 === 6 ? "border-r-0" : ""}`}
                    />
                  );
                }

                const dayGroups = getGroupsForDate(cell.date);
                const today = isToday(cell.date);
                const isSelected = selectedDate && isSameDay(cell.date, selectedDate);
                const hasOverflow = dayGroups.length > MAX_VISIBLE;
                const visible = dayGroups.slice(0, MAX_VISIBLE);

                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDate(isSelected ? null : cell.date)}
                    className={`min-h-[120px] border-b border-r border-white/[0.04] p-2 text-left transition-colors flex flex-col gap-1 ${
                      i % 7 === 6 ? "border-r-0" : ""
                    } ${
                      isSelected
                        ? "bg-blue-500/[0.10] ring-1 ring-inset ring-blue-400/40"
                        : dayGroups.length > 0
                        ? "hover:bg-white/[0.03]"
                        : "hover:bg-white/[0.02]"
                    }`}
                  >
                    {/* Day number */}
                    <div className={`text-xs leading-none shrink-0 mb-0.5 ${
                      today
                        ? "inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 text-white font-semibold"
                        : isSelected
                        ? "text-blue-300 font-medium"
                        : "text-white/50"
                    }`}>
                      {cell.day}
                    </div>

                    {/* Event pills */}
                    {visible.map((group) => (
                      <div
                        key={group.groupId}
                        className="w-full rounded-md px-1.5 py-0.5 text-[10px] leading-snug truncate bg-white/[0.07] text-white/65 flex items-center gap-1"
                        title={`${group.title || "Untitled"} — ${formatTime(group.scheduled_for)}`}
                      >
                        <div className="flex items-center gap-px shrink-0">
                          {group.posts.slice(0, 3).map((p) => {
                            const c = getColor(p.provider);
                            return <span key={p.id} className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />;
                          })}
                        </div>
                        <span className="truncate">{group.title || "Untitled"}</span>
                      </div>
                    ))}

                    {/* Overflow indicator */}
                    {hasOverflow && (
                      <div className="text-[10px] text-white/30 px-1">
                        +{dayGroups.length - MAX_VISIBLE} more
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Day detail sidebar */}
          <div className="w-64 shrink-0 sticky top-6 self-start">
            <div className="rounded-3xl border border-white/[0.08] bg-white/[0.025] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.4)]">
              {selectedDate ? (
                <>
                  <div className="px-5 py-4 border-b border-white/[0.06]">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs text-white/40 uppercase tracking-wider font-medium">
                          {selectedDate.toLocaleDateString(undefined, { weekday: "long" })}
                          {isToday(selectedDate) && <span className="ml-2 text-blue-400">Today</span>}
                        </p>
                        <h3 className="text-lg font-semibold mt-0.5">
                          {selectedDate.toLocaleDateString(undefined, { month: "long", day: "numeric" })}
                        </h3>
                      </div>
                      <button
                        onClick={() => setSelectedDate(null)}
                        className="mt-0.5 text-white/25 hover:text-white/50 transition-colors"
                        aria-label="Close"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <p className="text-xs text-white/30 mt-1">
                      {selectedDayGroups.length === 0 ? "No posts" : `${selectedDayGroups.length} post${selectedDayGroups.length !== 1 ? "s" : ""}`}
                    </p>
                  </div>

                  {selectedDayGroups.length === 0 ? (
                    <div className="px-5 py-10 text-center">
                      <p className="text-sm text-white/25">Nothing scheduled</p>
                      <Link
                        href="/uploads"
                        className="inline-block mt-3 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-white/50 hover:bg-white/10 transition-colors"
                      >
                        Schedule a post
                      </Link>
                    </div>
                  ) : (
                    <div className="divide-y divide-white/[0.05] max-h-[60vh] overflow-y-auto">
                      {selectedDayGroups.map((group) => (
                        <div key={group.groupId} className="px-5 py-3">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm text-white/80 font-medium truncate leading-snug">
                              {group.title || "Untitled"}
                            </p>
                            <span className="text-xs text-white/35 tabular-nums shrink-0 mt-0.5">
                              {formatTime(group.scheduled_for)}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center gap-1">
                            {group.posts.map((post) => (
                              <span
                                key={post.id}
                                className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.04]"
                                title={getColor(post.provider).label}
                              >
                                <ProviderIcon provider={post.provider} className="w-3 h-3" />
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="px-5 py-14 text-center">
                  <div className="w-10 h-10 rounded-2xl border border-white/[0.08] bg-white/[0.03] flex items-center justify-center mx-auto mb-3">
                    <svg className="w-5 h-5 text-white/20" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                    </svg>
                  </div>
                  <p className="text-sm text-white/30">Select a day</p>
                  <p className="text-xs text-white/20 mt-1">to view scheduled posts</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
