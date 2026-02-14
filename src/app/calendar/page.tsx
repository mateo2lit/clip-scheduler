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
};

const PROVIDER_STYLES: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  youtube: { bg: "bg-red-500/15", text: "text-red-400", dot: "bg-red-500", label: "YouTube" },
  tiktok: { bg: "bg-white/10", text: "text-white/70", dot: "bg-white", label: "TikTok" },
  instagram: { bg: "bg-pink-500/15", text: "text-pink-400", dot: "bg-pink-500", label: "Instagram" },
  facebook: { bg: "bg-blue-500/15", text: "text-blue-400", dot: "bg-blue-500", label: "Facebook" },
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
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells: { day: number; currentMonth: boolean; date: Date }[] = [];

  for (let i = firstDay - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    cells.push({ day, currentMonth: false, date: new Date(year, month - 1, day) });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, currentMonth: true, date: new Date(year, month, day) });
  }

  const remaining = 42 - cells.length;
  for (let day = 1; day <= remaining; day++) {
    cells.push({ day, currentMonth: false, date: new Date(year, month + 1, day) });
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

export default function CalendarPage() {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

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

  function goToday() {
    const today = new Date();
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
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

      // Only fetch scheduled + posted (no failed)
      const { data } = await supabase
        .from("scheduled_posts")
        .select("id, title, provider, scheduled_for, status")
        .eq("team_id", teamId)
        .in("status", ["scheduled", "ig_processing", "posted"])
        .order("scheduled_for", { ascending: true });

      setPosts(data ?? []);
      setLoading(false);
    }

    load();
  }, []);

  function getPostsForDate(date: Date) {
    return posts.filter((p) => isSameDay(new Date(p.scheduled_for), date));
  }

  // Selected day posts sorted by time
  const selectedDayPosts = selectedDate
    ? getPostsForDate(selectedDate).sort((a, b) => new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime())
    : [];

  return (
    <main className="min-h-screen bg-[#050505] text-white relative overflow-hidden">
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-blue-500/[0.07] via-purple-500/[0.04] to-transparent rounded-full blur-3xl" />

      {/* Nav */}
      <nav className="relative z-10 border-b border-white/5">
        <div className="mx-auto max-w-[1400px] px-6 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="text-lg font-semibold tracking-tight hover:text-white/80 transition-colors">Clip Dash</Link>
          <div className="flex items-center gap-3">
            <Link href="/settings" className="text-sm text-white/40 hover:text-white/70 transition-colors">Settings</Link>
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-[11px] font-semibold">
              {sessionEmail ? sessionEmail[0].toUpperCase() : "?"}
            </div>
          </div>
        </div>
      </nav>

      <div className="relative z-10 mx-auto max-w-[1400px] px-6 pt-10 pb-16">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
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
              <h1 className="text-lg font-semibold tracking-tight">Calendar</h1>
              <p className="text-sm text-white/40">
                {loading ? "Loading..." : `${posts.length} post${posts.length === 1 ? "" : "s"}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
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

        <div className="flex gap-6">
          {/* Calendar grid */}
          <div className="flex-1 min-w-0">
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">
                {MONTH_NAMES[viewMonth]} {viewYear}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={goToday}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 transition-colors"
                >
                  Today
                </button>
                <button
                  onClick={prevMonth}
                  className="h-8 w-8 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/10 transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                  </svg>
                </button>
                <button
                  onClick={nextMonth}
                  className="h-8 w-8 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/10 transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
              {/* Day headers */}
              <div className="grid grid-cols-7 border-b border-white/5">
                {DAY_NAMES.map((day) => (
                  <div key={day} className="px-2 py-2.5 text-center text-xs font-medium text-white/40 uppercase tracking-wider">
                    {day}
                  </div>
                ))}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7">
                {cells.map((cell, i) => {
                  const dayPosts = getPostsForDate(cell.date);
                  const today = isToday(cell.date);
                  const isSelected = selectedDate && isSameDay(cell.date, selectedDate);

                  return (
                    <button
                      key={i}
                      onClick={() => setSelectedDate(cell.date)}
                      className={`min-h-[120px] border-b border-r border-white/5 p-1.5 text-left transition-colors ${
                        !cell.currentMonth ? "bg-white/[0.01]" : ""
                      } ${i % 7 === 6 ? "border-r-0" : ""} ${
                        isSelected ? "bg-white/[0.06] ring-1 ring-inset ring-blue-500/40" : "hover:bg-white/[0.03]"
                      }`}
                    >
                      <div className={`text-xs mb-1 ${
                        today
                          ? "inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-500 text-white font-bold"
                          : cell.currentMonth
                            ? "text-white/60 pl-1"
                            : "text-white/20 pl-1"
                      }`}>
                        {cell.day}
                      </div>

                      {/* Condensed: show platform dots when there are posts */}
                      {dayPosts.length > 0 && (
                        <div className="flex flex-wrap gap-1 px-0.5">
                          {dayPosts.length <= 6 ? (
                            // Show individual pills for up to 6 posts
                            dayPosts.map((post) => {
                              const style = getStyle(post.provider);
                              return (
                                <div
                                  key={post.id}
                                  className={`rounded px-1 py-px text-[9px] leading-tight truncate max-w-full ${style.bg} ${style.text}`}
                                  title={`${post.title || "Untitled"} — ${style.label} — ${formatTime(post.scheduled_for)}`}
                                >
                                  {post.title || "Untitled"}
                                </div>
                              );
                            })
                          ) : (
                            // 7+ posts: show platform dot summary
                            <>
                              {dayPosts.slice(0, 2).map((post) => {
                                const style = getStyle(post.provider);
                                return (
                                  <div
                                    key={post.id}
                                    className={`rounded px-1 py-px text-[9px] leading-tight truncate max-w-full ${style.bg} ${style.text}`}
                                  >
                                    {post.title || "Untitled"}
                                  </div>
                                );
                              })}
                              <div className="flex items-center gap-0.5 mt-0.5">
                                {/* Show unique platform dots */}
                                {[...new Set(dayPosts.slice(2).map((p) => p.provider))].map((prov) => {
                                  const style = getStyle(prov);
                                  return <div key={prov} className={`w-2 h-2 rounded-full ${style.dot}`} title={style.label} />;
                                })}
                                <span className="text-[9px] text-white/30 ml-0.5">+{dayPosts.length - 2}</span>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Day detail panel */}
          <div className="w-80 shrink-0">
            {/* Platform legend */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4 mb-4">
              <h3 className="text-xs font-medium text-white/50 uppercase tracking-wider mb-3">Platforms</h3>
              <div className="flex flex-col gap-2">
                {Object.entries(PROVIDER_STYLES).map(([key, style]) => (
                  <div key={key} className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${style.dot}`} />
                    <span className="text-sm text-white/60">{style.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="sticky top-10 rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
              {selectedDate ? (
                <>
                  <div className="px-5 py-4 border-b border-white/5">
                    <h3 className="font-semibold">{formatFullDate(selectedDate)}</h3>
                    <p className="text-xs text-white/40 mt-0.5">
                      {selectedDayPosts.length} post{selectedDayPosts.length !== 1 ? "s" : ""}
                      {isToday(selectedDate) ? " · Today" : ""}
                    </p>
                  </div>

                  {selectedDayPosts.length === 0 ? (
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
                    <div className="divide-y divide-white/5 max-h-[60vh] overflow-y-auto">
                      {selectedDayPosts.map((post) => {
                        const style = getStyle(post.provider);
                        const isPast = post.status === "posted";
                        return (
                          <div key={post.id} className="px-5 py-3">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs text-white/40 tabular-nums w-16 shrink-0">
                                {formatTime(post.scheduled_for)}
                              </span>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${style.bg} ${style.text}`}>
                                {style.label}
                              </span>
                              {isPast && (
                                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">
                                  Posted
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-white/80 truncate pl-16">
                              {post.title || "Untitled"}
                            </p>
                          </div>
                        );
                      })}
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
