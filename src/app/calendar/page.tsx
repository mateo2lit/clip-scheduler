"use client";

import { useEffect, useState, useCallback } from "react";
import { DndContext, DragStartEvent, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { supabase } from "@/app/login/supabaseClient";
import AppPageOrb from "@/components/AppPageOrb";
import { ScheduledPost, PostGroup, groupPosts } from "./types";
import { CalendarHeader } from "./components/CalendarHeader";
import { MonthView } from "./components/MonthView";
import { WeekView } from "./components/WeekView";
import { PostPopover } from "./components/PostPopover";
import { DayOverflowPanel } from "./components/DayOverflowPanel";
import { CardDragOverlay } from "./components/CardDragOverlay";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export default function CalendarPage() {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string>("");
  const [view, setView] = useState<"month" | "week">("month");
  const [viewDate, setViewDate] = useState(new Date());
  const [platformFilter, setPlatformFilter] = useState("all");

  // Popover state
  const [popover, setPopover] = useState<{ group: PostGroup; rect: DOMRect } | null>(null);
  // Overflow panel state
  const [overflow, setOverflow] = useState<{ groups: PostGroup[]; rect: DOMRect } | null>(null);

  // DnD state
  const [activeGroup, setActiveGroup] = useState<PostGroup | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => {
    async function load() {
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) { window.location.href = "/login"; return; }
      setToken(auth.session.access_token);

      const t = auth.session.access_token;
      const teamRes = await fetch("/api/team/me", { headers: { Authorization: `Bearer ${t}` } });
      const teamJson = await teamRes.json();
      if (!teamJson.ok) { setLoading(false); return; }
      const teamId = teamJson.teamId;

      const { data } = await supabase
        .from("scheduled_posts")
        .select("id, title, description, provider, scheduled_for, status, group_id, thumbnail_path, platform_account_id")
        .eq("team_id", teamId)
        .in("status", ["scheduled", "ig_processing", "posted", "failed"])
        .order("scheduled_for", { ascending: true });

      setPosts(data ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const allGroups = groupPosts(posts);
  const filteredGroups = platformFilter === "all"
    ? allGroups
    : allGroups.filter(g => g.posts.some(p => (p.provider || "").toLowerCase() === platformFilter));

  const activePlatforms = [...new Set(allGroups.flatMap(g => g.posts.map(p => (p.provider || "").toLowerCase())))].filter(p => Boolean(p) && p !== "threads");

  // Navigation
  function prev() {
    const d = new Date(viewDate);
    if (view === "month") d.setMonth(d.getMonth() - 1);
    else d.setDate(d.getDate() - 7);
    setViewDate(d);
  }
  function next() {
    const d = new Date(viewDate);
    if (view === "month") d.setMonth(d.getMonth() + 1);
    else d.setDate(d.getDate() + 7);
    setViewDate(d);
  }
  function today() { setViewDate(new Date()); }

  // DnD handlers
  function onDragStart(event: DragStartEvent) {
    const group = event.active.data.current?.group as PostGroup | undefined;
    setActiveGroup(group ?? null);
    setPopover(null);
    setOverflow(null);
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveGroup(null);
    const { active, over } = event;
    if (!over) return;

    const groupId = String(active.id).replace("group-", "");
    const overId = String(over.id);
    const group = allGroups.find(g => g.groupId === groupId);
    if (!group) return;

    let newScheduledFor: Date;

    if (overId.startsWith("day-")) {
      const [, y, m, d] = overId.match(/^day-(\d{4})-(\d{2})-(\d{2})$/) || [];
      if (!y) return;
      const original = new Date(group.scheduled_for);
      newScheduledFor = new Date(Number(y), Number(m) - 1, Number(d), original.getHours(), original.getMinutes(), original.getSeconds());
    } else if (overId.startsWith("slot-")) {
      const [, dateStr, hourStr] = overId.match(/^slot-(\d{8}):(\d{2})$/) || [];
      if (!dateStr) return;
      const y = Number(dateStr.slice(0, 4));
      const m = Number(dateStr.slice(4, 6)) - 1;
      const d = Number(dateStr.slice(6, 8));
      const h = Number(hourStr);
      newScheduledFor = new Date(y, m, d, h, 0, 0);
    } else {
      return;
    }

    const newIso = newScheduledFor.toISOString();
    const originalScheduledFor = group.scheduled_for;

    // Optimistic update
    setPosts(prev => prev.map(p => {
      const key = p.group_id || p.id;
      if (key === groupId && p.status === "scheduled") {
        return { ...p, scheduled_for: newIso };
      }
      return p;
    }));

    // API call
    fetch("/api/scheduled-posts/reschedule", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ groupId, scheduledFor: newIso }),
    }).then(res => {
      if (!res.ok) {
        setPosts(prev => prev.map(p => {
          const key = p.group_id || p.id;
          if (key === groupId) return { ...p, scheduled_for: originalScheduledFor };
          return p;
        }));
        alert("Failed to reschedule post. Please try again.");
      }
    });
  }

  // Popover callbacks
  const handleRescheduled = useCallback((groupId: string, newIso: string) => {
    setPosts(prev => prev.map(p => {
      const key = p.group_id || p.id;
      return key === groupId && p.status === "scheduled" ? { ...p, scheduled_for: newIso } : p;
    }));
  }, []);

  const handleCancelled = useCallback((groupId: string) => {
    setPosts(prev => prev.filter(p => (p.group_id || p.id) !== groupId));
  }, []);

  const handleRetried = useCallback((groupId: string) => {
    setPosts(prev => prev.map(p => {
      const key = p.group_id || p.id;
      return key === groupId && p.status === "failed" ? { ...p, status: "scheduled" as const } : p;
    }));
  }, []);

  return (
    <main className="min-h-screen bg-[#050505] text-white relative overflow-hidden">
      <AppPageOrb />
      <div className="relative z-10 mx-auto max-w-7xl px-6 pt-8 pb-16">
        <CalendarHeader
          view={view}
          onViewChange={setView}
          viewDate={viewDate}
          onPrev={prev}
          onNext={next}
          onToday={today}
          platformFilter={platformFilter}
          onPlatformFilter={setPlatformFilter}
          activePlatforms={activePlatforms}
          postCount={filteredGroups.filter(g => g.status === "scheduled").length}
        />

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-white/30 text-sm">Loading…</p>
          </div>
        ) : (
          <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
            {view === "month" ? (
              <MonthView
                year={viewDate.getFullYear()}
                month={viewDate.getMonth()}
                groups={filteredGroups}
                supabaseUrl={SUPABASE_URL}
                onCardClick={(group, rect) => { setOverflow(null); setPopover({ group, rect }); }}
                onOverflow={(groups, rect) => { setPopover(null); setOverflow({ groups, rect }); }}
              />
            ) : (
              <WeekView
                viewDate={viewDate}
                groups={filteredGroups}
                supabaseUrl={SUPABASE_URL}
                onCardClick={(group, rect) => { setOverflow(null); setPopover({ group, rect }); }}
              />
            )}
            <CardDragOverlay activeGroup={activeGroup} supabaseUrl={SUPABASE_URL} />
          </DndContext>
        )}
      </div>

      {/* Overlay portals — rendered outside DndContext to avoid z-index issues */}
      {popover && (
        <PostPopover
          group={popover.group}
          anchorRect={popover.rect}
          supabaseUrl={SUPABASE_URL}
          token={token}
          onClose={() => setPopover(null)}
          onRescheduled={handleRescheduled}
          onCancelled={handleCancelled}
          onRetried={handleRetried}
        />
      )}
      {overflow && (
        <DayOverflowPanel
          groups={overflow.groups}
          anchorRect={overflow.rect}
          supabaseUrl={SUPABASE_URL}
          onCardClick={(group, rect) => { setOverflow(null); setPopover({ group, rect }); }}
          onClose={() => setOverflow(null)}
        />
      )}
    </main>
  );
}
