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

const PROVIDER_STYLES: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  youtube: { bg: "bg-red-500/15", text: "text-red-400", dot: "bg-red-500", label: "YouTube" },
  tiktok: { bg: "bg-white/10", text: "text-white/70", dot: "bg-white", label: "TikTok" },
  instagram: { bg: "bg-pink-500/15", text: "text-pink-400", dot: "bg-pink-500", label: "Instagram" },
  facebook: { bg: "bg-blue-500/15", text: "text-blue-400", dot: "bg-blue-500", label: "Facebook" },
  linkedin: { bg: "bg-sky-500/15", text: "text-sky-400", dot: "bg-sky-500", label: "LinkedIn" },
  x: { bg: "bg-white/10", text: "text-white/70", dot: "bg-white", label: "X" },
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

  for (let i = 0; i < firstDay; i++) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, date: new Date(year, month, day) });
  }

  const trailing = (7 - (cells.length % 7)) % 7;
  for (let i = 0; i < trailing; i++) {
    cells.push(null);
  }

  return cells;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isToday(date: Date) {
  return isSameDay(date, new Date());
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatFullDate(date: Date) {
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function getStyle(provider: string | null) {
  return PROVIDER_STYLES[(provider || "").toLowerCase()] || { bg: "bg-white/10", text: "text-white/50", dot: "bg-white/40", label: provider || "Unknown" };
}

function PlatformIcon({ provider }: { provider: string | null }) {
  const p = (provider || "").toLowerCase();
  if (p === "youtube") {
    return (
      <svg className="w-3.5 h-3.5 text-red-400" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 30 30 0 0 0 0 12c0 2 .2 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1c.3-1.9.5-3.8.5-5.8s-.2-3.9-.5-5.8ZM9.6 15.6V8.4l6.3 3.6-6.3 3.6Z" />
      </svg>
    );
  }
  if (p === "facebook") return <span className="text-blue-400 text-[11px] font-bold">f</span>;
  if (p === "instagram") return <span className="text-pink-400 text-[11px] font-bold">ig</span>;
  if (p === "linkedin") return <span className="text-sky-400 text-[11px] font-bold">in</span>;
  if (p === "tiktok") return <span className="text-white/80 text-[11px] font-bold">tt</span>;
  return <span className="text-white/60 text-[10px] font-bold">?</span>;
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

const MAX_GROUPS_VISIBLE_PER_DAY = 6;

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
  const filteredGroups = allGroups.filter((g) => {
    if (platformFilter === "all") return true;
    return g.posts.some((p) => (p.provider || "").toLowerCase() === platformFilter);
  });
  const selectablePlatforms = Object.entries(PROVIDER_STYLES).filter(([key]) => key !== "x");

  function getGroupsForDate(date: Date) {
    return filteredGroups.filter((g) => isSameDay(new Date(g.scheduled_for), date));
  }

  function getPostsForDate(date: Date) {
    return posts.filter((p) => isSameDay(new Date(p.scheduled_for), date));
  }

  const selectedDayGroups = selectedDate
    ? getGroupsForDate(selectedDate).sort((a, b) => new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime())
    : [];

  return (
    <main className="min-h-screen bg-[#050505] text-white relative overflow-hidden">
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-blue-500/[0.07] via-purple-500/[0.04] to-transparent rounded-full blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 w-[500px] h-[500px] bg-gradient-to-t from-purple-500/[0.05] to-transparent rounded-full blur-3xl" />
      <div className="pointer-events-none absolute -top-20 left-[-6rem] h-64 w-64 rounded-full bg-pink-500/[0.05] blur-3xl" />

      {/* Nav */}
      <nav className="relative z-10 border-b border-white/5">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="text-lg font-semibold tracking-tight hover:text-white/80 transition-colors">Clip Dash</Link>
          <div className="flex items-center gap-3">
            <Link href="/settings" className="text-sm text-white/40 hover:text-white/70 transition-colors">Settings</Link>
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-[11px] font-semibold">
              {sessionEmail ? sessionEmail[0].toUpperCase() : "?"}
            </div>
          </div>
        </div>
      </nav>

      <div className="relative z-10 mx-auto max-w-[1500px] px-6 pt-10 pb-16">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/dashboard"
              className="h-8 w-8 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/10 transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </Link>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Calendar</h1>
              <p className="text-sm text-white/40">
                {loading ? "Loading..." : `${filteredGroups.length} post${filteredGroups.length === 1 ? "" : "s"}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={prevMonth}
              className="h-8 w-8 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/50 hover:text-white/80 hover:bg-white/10 transition-all"
              aria-label="Previous month"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <h2 className="text-2xl font-bold whitespace-nowrap min-w-[220px] text-center">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </h2>
            <button
              onClick={nextMonth}
              className="h-8 w-8 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/50 hover:text-white/80 hover:bg-white/10 transition-all"
              aria-label="Next month"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Link
              href="/scheduled"
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/60 hover:bg-white/10 transition-colors"
            >
              List view
            </Link>
            <Link
              href="/upload"
              className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-white/90 transition-colors"
            >
              New upload
            </Link>
          </div>
        </div>

        <div className="flex gap-4">
          {/* Calendar grid */}
          <div className="flex-1 min-w-0">
            <div className="relative">
              <div className="relative rounded-3xl border border-white/10 bg-white/[0.03] overflow-hidden shadow-[0_20px_70px_rgba(2,6,23,0.45)]">
              {/* Day headers */}
              <div className="grid grid-cols-7 border-b border-white/5">
                {DAY_NAMES.map((day) => (
                  <div key={day} className="px-2 py-3 text-center text-[11px] font-medium text-white/40 uppercase tracking-wider">
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
                        className={`min-h-[160px] border-b border-r border-white/5 bg-transparent ${i % 7 === 6 ? "border-r-0" : ""}`}
                      />
                    );
                  }

                  const dayGroups = getGroupsForDate(cell.date);
                  const today = isToday(cell.date);
                  const isSelected = selectedDate && isSameDay(cell.date, selectedDate);

                  return (
                    <button
                      key={i}
                      onClick={() => setSelectedDate(cell.date)}
                      className={`min-h-[160px] border-b border-r border-white/5 p-2 text-left transition-colors flex flex-col ${
                        i % 7 === 6 ? "border-r-0" : ""
                      } ${
                        isSelected
                          ? "bg-blue-500/12 ring-2 ring-inset ring-blue-400/70 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.35)]"
                          : "hover:bg-white/[0.03]"
                      }`}
                    >
                      <div className={`text-xs shrink-0 ${
                        today
                          ? "inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-500 text-white font-bold"
                          : "text-white/60"
                      }`}>
                        {cell.day}
                      </div>

                      {dayGroups.length > 0 && (
                        <div className="flex flex-col gap-0.5 mt-1 min-w-0 overflow-hidden">
                          {(dayGroups.length <= MAX_GROUPS_VISIBLE_PER_DAY
                            ? dayGroups
                            : dayGroups.slice(0, MAX_GROUPS_VISIBLE_PER_DAY)).map((group) => (
                            <div
                              key={group.groupId}
                              className="rounded px-1 py-px text-[9px] leading-tight truncate bg-white/10 text-white/60 flex items-center gap-0.5"
                              title={`${group.title || "Untitled"} — ${formatTime(group.scheduled_for)}`}
                            >
                              {group.posts.map((p) => {
                                const style = getStyle(p.provider);
                                return <span key={p.id} className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />;
                              })}
                              <span className="truncate ml-0.5">{group.title || "Untitled"}</span>
                            </div>
                          ))}
                          {dayGroups.length > MAX_GROUPS_VISIBLE_PER_DAY && (
                            <div className="flex items-center gap-0.5">
                              {[...new Set(dayGroups.slice(MAX_GROUPS_VISIBLE_PER_DAY).flatMap((g) => g.posts.map((p) => p.provider)))].map((prov) => {
                                const style = getStyle(prov);
                                return <div key={prov} className={`w-2 h-2 rounded-full ${style.dot}`} title={style.label} />;
                              })}
                              <span className="text-[9px] text-white/30 ml-0.5">+{dayGroups.length - MAX_GROUPS_VISIBLE_PER_DAY}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            </div>

          </div>

          {/* Day detail panel */}
          <div className="w-64 shrink-0">
            {/* Platform legend */}
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] px-5 py-4 mb-4 shadow-[0_20px_70px_rgba(2,6,23,0.45)]">
              <h3 className="text-xs font-medium text-white/50 uppercase tracking-wider mb-3">Platforms</h3>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setPlatformFilter("all")}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors ${
                    platformFilter === "all" ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/[0.05]"
                  }`}
                >
                  <div className="w-2.5 h-2.5 rounded-full bg-white/60" />
                  <span className="text-sm">All platforms</span>
                </button>
                {selectablePlatforms.map(([key, style]) => (
                  <button
                    key={key}
                    onClick={() => setPlatformFilter(key)}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors ${
                      platformFilter === key ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className={`w-2.5 h-2.5 rounded-full ${style.dot}`} />
                    <span className="text-sm">{style.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="sticky top-10 rounded-3xl border border-white/10 bg-white/[0.03] overflow-hidden shadow-[0_20px_70px_rgba(2,6,23,0.45)]">
              {selectedDate ? (
                <>
                  <div className="px-5 py-4 border-b border-white/5">
                    <h3 className="font-semibold">{formatFullDate(selectedDate)}</h3>
                    <p className="text-xs text-white/40 mt-0.5">
                      {selectedDayGroups.length} post{selectedDayGroups.length !== 1 ? "s" : ""}
                      {isToday(selectedDate) ? " · Today" : ""}
                    </p>
                  </div>

                  {selectedDayGroups.length === 0 ? (
                    <div className="px-5 py-10 text-center">
                      <p className="text-sm text-white/30">No posts this day</p>
                      <Link
                        href="/upload"
                        className="inline-block mt-3 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-white/60 hover:bg-white/10 transition-colors"
                      >
                        Schedule a post
                      </Link>
                    </div>
                  ) : (
                    <div className="divide-y divide-white/5 max-h-[56vh] overflow-y-auto">
                      {selectedDayGroups.map((group) => (
                        <div key={group.groupId} className="px-5 py-3">
                          <div className="flex items-start gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm text-white/85 truncate">
                                  {group.title || "Untitled"}
                                </p>
                                <span className="text-xs text-white/40 tabular-nums shrink-0">
                                  {formatTime(group.scheduled_for)}
                                </span>
                              </div>
                              <div className="mt-1 flex items-center gap-1.5">
                                {group.posts.map((post) => (
                                  <span
                                    key={post.id}
                                    className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-white/10 bg-white/[0.04]"
                                    title={getStyle(post.provider).label}
                                  >
                                    <PlatformIcon provider={post.provider} />
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="px-5 py-14 text-center">
                  <svg className="w-8 h-8 text-white/15 mx-auto mb-3" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                  </svg>
                  <p className="text-sm text-white/30">Click a day to see details</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}



