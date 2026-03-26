# Calendar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the basic monthly calendar at `/calendar` with a full-featured content calendar — month + week views, rich post cards with thumbnails, in-place post popover, and drag-to-reschedule.

**Architecture:** The existing `page.tsx` is fully rewritten and decomposed into focused components under `src/app/calendar/components/`. Three new API routes handle reschedule, cancel, and retry. `@dnd-kit/core` provides drag-and-drop with `DndContext` at the page level wrapping both views.

**Tech Stack:** Next.js 14.2 App Router, React 18, TypeScript, Tailwind CSS v4, `@dnd-kit/core` + `@dnd-kit/modifiers` + `@dnd-kit/utilities`, Supabase anon client (frontend data fetch), Supabase Admin (API routes)

---

## File Map

**Create (new):**
- `src/app/calendar/types.ts` — shared types: `ScheduledPost`, `PostGroup`, provider color/label map
- `src/app/calendar/components/CalendarHeader.tsx` — view toggle, nav, today button, platform filter pills
- `src/app/calendar/components/ProviderIcon.tsx` — SVG platform icons (extracted from old page.tsx)
- `src/app/calendar/components/PostCard.tsx` — compact (month) and full (week) variants
- `src/app/calendar/components/PostPopover.tsx` — in-place popover with context-sensitive actions
- `src/app/calendar/components/DayOverflowPanel.tsx` — "+N more" overflow list for month cells
- `src/app/calendar/components/CardDragOverlay.tsx` — floating card shown during drag
- `src/app/calendar/components/DayCell.tsx` — droppable day cell for month view
- `src/app/calendar/components/MonthView.tsx` — 7-column month grid
- `src/app/calendar/components/TimeSlot.tsx` — droppable 1-hour row for week view
- `src/app/calendar/components/WeekView.tsx` — 24-row × 7-column time grid
- `src/app/api/scheduled-posts/reschedule/route.ts` — PATCH: bulk-reschedule a group
- `src/app/api/scheduled-posts/[id]/retry/route.ts` — PATCH: reset failed post to scheduled

**Modify (existing):**
- `src/app/calendar/page.tsx` — full rewrite: auth, data fetch, DndContext, view state
- `src/app/api/scheduled-posts/[id]/route.ts` — add DELETE handler for cancel

---

## Task 1: Install dnd-kit dependencies

**Files:** `package.json`

- [ ] **Step 1: Install packages**

```bash
cd C:/Users/dbher/clip-scheduler
npm install @dnd-kit/core @dnd-kit/modifiers @dnd-kit/utilities
```

- [ ] **Step 2: Verify install**

```bash
node -e "require('@dnd-kit/core'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(calendar): install @dnd-kit/core, /modifiers, /utilities"
```

---

## Task 2: Shared types

**Files:**
- Create: `src/app/calendar/types.ts`

- [ ] **Step 1: Create types file**

```ts
// src/app/calendar/types.ts

export type PostStatus = "scheduled" | "ig_processing" | "posted" | "failed";

export type ScheduledPost = {
  id: string;
  title: string | null;
  description: string | null;
  provider: string | null;
  scheduled_for: string;
  status: PostStatus;
  group_id: string | null;
  thumbnail_path: string | null;
  platform_account_id: string | null;
};

export type PostGroup = {
  groupId: string; // group_id ?? id
  title: string | null;
  description: string | null;
  scheduled_for: string;
  status: PostStatus;
  thumbnail_path: string | null;
  posts: ScheduledPost[];
};

export const PROVIDER_META: Record<string, { label: string; dotClass: string }> = {
  youtube:   { label: "YouTube",   dotClass: "bg-red-500"    },
  tiktok:    { label: "TikTok",    dotClass: "bg-white/70"   },
  instagram: { label: "Instagram", dotClass: "bg-pink-500"   },
  facebook:  { label: "Facebook",  dotClass: "bg-blue-500"   },
  linkedin:  { label: "LinkedIn",  dotClass: "bg-sky-500"    },
  bluesky:   { label: "Bluesky",   dotClass: "bg-sky-400"    },
  threads:   { label: "Threads",   dotClass: "bg-white/50"   },
};

export const STATUS_META: Record<string, { label: string; dotClass: string; badgeClass: string }> = {
  scheduled:     { label: "Scheduled",   dotClass: "bg-blue-400",  badgeClass: "bg-blue-500/20 text-blue-300"   },
  ig_processing: { label: "Processing",  dotClass: "bg-amber-400", badgeClass: "bg-amber-500/20 text-amber-300" },
  posted:        { label: "Posted",      dotClass: "bg-green-400", badgeClass: "bg-green-500/20 text-green-300" },
  failed:        { label: "Failed",      dotClass: "bg-red-400",   badgeClass: "bg-red-500/20 text-red-300"     },
};

/** Resolve a thumbnail_path to a public URL. Returns null if path is empty. */
export function thumbnailUrl(path: string | null, supabaseUrl: string): string | null {
  if (!path) return null;
  return `${supabaseUrl}/storage/v1/object/public/clips/${path}`;
}

/** Group an array of ScheduledPost into PostGroup[] */
export function groupPosts(posts: ScheduledPost[]): PostGroup[] {
  const map = new Map<string, ScheduledPost[]>();
  for (const post of posts) {
    const key = post.group_id || post.id;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(post);
  }
  return Array.from(map.entries()).map(([groupId, members]) => ({
    groupId,
    title: members[0].title,
    description: members[0].description,
    scheduled_for: members[0].scheduled_for,
    status: members[0].status,
    thumbnail_path: members[0].thumbnail_path,
    posts: members,
  }));
}

export function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch { return ""; }
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/calendar/types.ts
git commit -m "feat(calendar): add shared types, helpers, provider/status metadata"
```

---

## Task 3: API — reschedule endpoint

**Files:**
- Create: `src/app/api/scheduled-posts/reschedule/route.ts`

- [ ] **Step 1: Create file**

```ts
// src/app/api/scheduled-posts/reschedule/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";

/**
 * PATCH /api/scheduled-posts/reschedule
 * Body: { groupId: string, scheduledFor: string (ISO) }
 *
 * Updates all scheduled_posts where team_id matches AND status = 'scheduled'
 * AND (group_id = groupId OR id = groupId).
 * The client sends the post's own id as groupId when group_id is null.
 */
export async function PATCH(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;
    const { teamId } = result.ctx;

    const body = await req.json().catch(() => ({}));
    const { groupId, scheduledFor } = body;

    if (!groupId || !scheduledFor) {
      return NextResponse.json({ ok: false, error: "groupId and scheduledFor required" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("scheduled_posts")
      .update({ scheduled_for: scheduledFor })
      .eq("team_id", teamId)
      .eq("status", "scheduled")
      .or(`group_id.eq.${groupId},and(id.eq.${groupId},group_id.is.null)`);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Start dev server and verify route exists**

```bash
npm run dev
```

In a separate terminal:
```bash
curl -X PATCH http://localhost:3000/api/scheduled-posts/reschedule \
  -H "Content-Type: application/json" \
  -d '{}'
```
Expected: `{"ok":false,"error":"..."}`  (auth error or validation error — proves the route is reachable)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/scheduled-posts/reschedule/route.ts
git commit -m "feat(calendar): add PATCH /api/scheduled-posts/reschedule endpoint"
```

---

## Task 4: API — cancel (DELETE) handler

**Files:**
- Modify: `src/app/api/scheduled-posts/[id]/route.ts`

Add the DELETE export **after** the existing PATCH export. Do not touch the existing PATCH logic or the collection-level `src/app/api/scheduled-posts/route.ts`.

- [ ] **Step 1: Add DELETE handler to `src/app/api/scheduled-posts/[id]/route.ts`**

Append this after the closing brace of the existing `PATCH` function:

```ts
/**
 * DELETE /api/scheduled-posts/[id]
 * Cancels a scheduled post. Only works when status = 'scheduled'.
 * Returns 409 if the post is no longer in scheduled status.
 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;
    const { teamId } = result.ctx;

    const { id } = params;
    if (!id) return NextResponse.json({ ok: false, error: "Missing post id" }, { status: 400 });

    const { data: post } = await supabaseAdmin
      .from("scheduled_posts")
      .select("id, status, team_id")
      .eq("id", id)
      .maybeSingle();

    if (!post) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (post.team_id !== teamId) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    if (post.status !== "scheduled") {
      return NextResponse.json({ ok: false, error: "not_scheduled" }, { status: 409 });
    }

    const { error } = await supabaseAdmin
      .from("scheduled_posts")
      .delete()
      .eq("id", id);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify route exists**

```bash
curl -X DELETE http://localhost:3000/api/scheduled-posts/nonexistent-id \
  -H "Authorization: Bearer test"
```
Expected: some JSON error response (not a 404 "route not found" from Next.js itself)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/scheduled-posts/[id]/route.ts
git commit -m "feat(calendar): add DELETE handler to /api/scheduled-posts/[id] for cancel"
```

---

## Task 5: API — retry endpoint

**Files:**
- Create: `src/app/api/scheduled-posts/[id]/retry/route.ts`

- [ ] **Step 1: Create file**

```ts
// src/app/api/scheduled-posts/[id]/retry/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";

/**
 * PATCH /api/scheduled-posts/[id]/retry
 * Resets a failed post back to 'scheduled' so the worker picks it up again.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;
    const { teamId } = result.ctx;

    const { id } = params;
    if (!id) return NextResponse.json({ ok: false, error: "Missing post id" }, { status: 400 });

    const { data: post } = await supabaseAdmin
      .from("scheduled_posts")
      .select("id, status, team_id")
      .eq("id", id)
      .maybeSingle();

    if (!post) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (post.team_id !== teamId) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    if (post.status !== "failed") {
      return NextResponse.json({ ok: false, error: "Only failed posts can be retried" }, { status: 409 });
    }

    const { error } = await supabaseAdmin
      .from("scheduled_posts")
      .update({ status: "scheduled", last_error: null })
      .eq("id", id);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/scheduled-posts/[id]/retry/route.ts
git commit -m "feat(calendar): add PATCH /api/scheduled-posts/[id]/retry endpoint"
```

---

## Task 6: PostCard component

**Files:**
- Create: `src/app/calendar/components/PostCard.tsx`

This component renders in two variants: `"compact"` (month view) and `"full"` (week view). It does **not** contain the drag logic itself — draggable wrapping is done by the parent (DayCell for month, TimeSlot for week).

- [ ] **Step 1: Create PostCard**

```tsx
// src/app/calendar/components/PostCard.tsx
"use client";

import { PostGroup, PROVIDER_META, STATUS_META, thumbnailUrl, formatTime } from "../types";
import { ProviderIcon } from "./ProviderIcon";

type Props = {
  group: PostGroup;
  variant: "compact" | "full";
  supabaseUrl: string;
  onClick: (group: PostGroup, rect: DOMRect) => void;
  dimmed?: boolean; // for opacity during drag
};

export function PostCard({ group, variant, supabaseUrl, onClick, dimmed }: Props) {
  const thumb = thumbnailUrl(group.thumbnail_path, supabaseUrl);
  const status = STATUS_META[group.status] ?? STATUS_META.scheduled;
  const time = formatTime(group.scheduled_for);
  const providers = [...new Set(group.posts.map(p => (p.provider || "").toLowerCase()))];

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    onClick(group, rect);
  }

  if (variant === "compact") {
    return (
      <div
        onClick={handleClick}
        className={`w-full flex items-center gap-1.5 rounded-md px-1.5 py-1 cursor-pointer select-none
          bg-white/[0.06] hover:bg-white/[0.10] transition-colors text-white/80
          ${dimmed ? "opacity-40" : ""}`}
      >
        {/* Thumbnail */}
        <div className="w-6 h-6 rounded shrink-0 overflow-hidden bg-white/10">
          {thumb ? (
            <img src={thumb} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-white/5" />
          )}
        </div>

        {/* Platform dots */}
        <div className="flex items-center gap-px shrink-0">
          {providers.slice(0, 4).map((p) => (
            <span key={p} className={`w-1.5 h-1.5 rounded-full ${PROVIDER_META[p]?.dotClass ?? "bg-white/30"}`} />
          ))}
          {providers.length > 4 && (
            <span className="text-[9px] text-white/30 ml-0.5">+{providers.length - 4}</span>
          )}
        </div>

        {/* Title */}
        <span className="flex-1 truncate text-[10px] leading-none">{group.title || "Untitled"}</span>

        {/* Time */}
        <span className="text-[9px] text-white/35 shrink-0 tabular-nums">{time}</span>

        {/* Status dot */}
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${status.dotClass}`} />
      </div>
    );
  }

  // Full variant (week view)
  return (
    <div
      onClick={handleClick}
      className={`w-full rounded-lg overflow-hidden cursor-pointer select-none
        bg-white/[0.06] hover:bg-white/[0.10] transition-colors border border-white/[0.08]
        ${dimmed ? "opacity-40" : ""}`}
    >
      {/* Thumbnail banner */}
      <div className="relative w-full h-12 bg-white/5 overflow-hidden">
        {thumb ? (
          <img src={thumb} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-white/5 to-white/10" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
      </div>

      {/* Body */}
      <div className="px-2 py-1.5">
        {/* Platform + name */}
        {providers[0] && (
          <div className="flex items-center gap-1 mb-1">
            <ProviderIcon provider={providers[0]} className="w-3 h-3" />
            <span className="text-[9px] text-white/40 uppercase tracking-wide">
              {PROVIDER_META[providers[0]]?.label}
            </span>
          </div>
        )}

        {/* Title */}
        <p className="text-[11px] font-medium text-white/85 leading-tight truncate">
          {group.title || "Untitled"}
        </p>

        {/* Excerpt */}
        {group.description && (
          <p className="text-[10px] text-white/40 leading-tight truncate mt-0.5">
            {group.description}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[9px] text-white/35 tabular-nums">{time}</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${status.badgeClass}`}>
            {status.label}
          </span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create ProviderIcon helper** (extracted from existing `page.tsx` logic)

```tsx
// src/app/calendar/components/ProviderIcon.tsx
"use client";

type Props = { provider: string | null; className?: string };

export function ProviderIcon({ provider, className = "w-3.5 h-3.5" }: Props) {
  const p = (provider || "").toLowerCase();
  if (p === "youtube") return <svg className={`${className} text-red-400`} viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814ZM9.545 15.568V8.432L15.818 12l-6.273 3.568Z" /></svg>;
  if (p === "facebook") return <svg className={`${className} text-blue-400`} viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073Z" /></svg>;
  if (p === "instagram") return <svg className={`${className} text-pink-400`} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069ZM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0Zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881Z" /></svg>;
  if (p === "tiktok") return <svg className={`${className} text-white/70`} viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07Z" /></svg>;
  if (p === "linkedin") return <svg className={`${className} text-sky-400`} viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286ZM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065Zm1.782 13.019H3.555V9h3.564v11.452ZM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 23.2 24 22.222 0h.003Z" /></svg>;
  if (p === "bluesky") return <svg className={`${className} text-sky-400`} viewBox="0 0 360 320" fill="currentColor"><path d="M180 142c-16.3-31.7-60.7-90.8-102-120C38 2 27.5-2 20 2 10 7.5 10 25.5 10 35V90c0 50 38 65 76 73-38 8-76 23-76 73v55c0 9.5 0 27.5 10 33 7.5 4 18 0 58-20 41.3-29.2 85.7-88.3 102-120zm0 0c16.3-31.7 60.7-90.8 102-120 40-20 50.5-24 58-20 10 5.5 10 23.5 10 33v55c0 50-38 65-76 73 38 8 76 23 76 73v55c0 9.5 0 27.5-10 33-7.5 4-18 0-58-20C240.7 230.8 196.3 171.7 180 142z" /></svg>;
  if (p === "threads") return <svg className={`${className} text-white/60`} viewBox="0 0 24 24" fill="currentColor"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.5 12.068V12c.05-4.073 1.364-7.298 3.905-9.58C7.628.302 10.594-.06 12.186 0c2.64.065 4.955.942 6.681 2.534.94.861 1.696 1.957 2.25 3.258l-2.145.9c-.427-1.012-1.03-1.881-1.793-2.582-1.33-1.218-3.15-1.872-5.053-1.915-1.275-.032-3.6.239-5.392 1.913C4.899 5.69 3.884 8.26 3.84 11.998c.038 3.733 1.053 6.3 3.014 7.847 1.782 1.374 4.107 1.662 5.367 1.682 1.254-.005 3.424-.237 5.25-1.624.926-.71 1.63-1.63 2.09-2.73-1.208-.226-2.457-.285-3.73-.147-2.02.217-3.717-.185-5.04-1.196-.959-.728-1.505-1.833-1.514-2.949-.013-1.208.496-2.372 1.389-3.191 1.083-.994 2.67-1.487 4.712-1.487a11.91 11.91 0 0 1 1.96.164c-.143-.49-.38-.882-.714-1.165-.522-.442-1.329-.667-2.396-.667l-.118.001c-.899.01-2.094.317-2.823 1.218l-1.617-1.38C9.5 7.067 11.083 6.5 12.72 6.5l.156-.001c1.597-.007 2.936.388 3.88 1.168.99.815 1.534 2.016 1.617 3.578.1 1.828-.265 3.382-1.086 4.624-.821 1.241-2.071 2.097-3.617 2.475a10.6 10.6 0 0 1-2.52.296c-2.01-.003-3.41-.55-4.165-1.636-.48-.687-.636-1.504-.49-2.413.215-1.326 1.1-2.477 2.482-3.235 1.028-.565 2.2-.808 3.468-.72.447.03.883.084 1.303.161-.12-.857-.477-1.423-.979-1.694-.545-.292-1.245-.355-1.78-.16-.617.224-1.126.747-1.516 1.555l-1.972-.906c.568-1.24 1.46-2.154 2.643-2.72 1.002-.476 2.123-.616 3.237-.405 1.4.267 2.483 1.038 3.13 2.233.551 1.014.787 2.285.696 3.78a11.72 11.72 0 0 1-.1.99c-.11.762-.286 1.46-.52 2.083 1.58.048 3.121.386 4.573.996-.015.14-.03.278-.046.414-.257 2.155-1.023 3.932-2.278 5.282C17.236 22.803 14.85 23.975 12.186 24z" /></svg>;
  return null;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/calendar/components/PostCard.tsx src/app/calendar/components/ProviderIcon.tsx
git commit -m "feat(calendar): add PostCard (compact+full variants) and ProviderIcon"
```

---

## Task 7: PostPopover component

**Files:**
- Create: `src/app/calendar/components/PostPopover.tsx`

The popover is absolutely positioned using an anchor `DOMRect` passed from the card click handler. It uses `useEffect` to handle outside click and Escape key.

- [ ] **Step 1: Create PostPopover**

```tsx
// src/app/calendar/components/PostPopover.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { PostGroup, PROVIDER_META, STATUS_META, thumbnailUrl, formatTime } from "../types";
import { ProviderIcon } from "./ProviderIcon";

type Props = {
  group: PostGroup;
  anchorRect: DOMRect;
  supabaseUrl: string;
  token: string;
  onClose: () => void;
  onRescheduled: (groupId: string, newIso: string) => void;
  onCancelled: (groupId: string) => void;
  onRetried: (groupId: string) => void;
};

export function PostPopover({ group, anchorRect, supabaseUrl, token, onClose, onRescheduled, onCancelled, onRetried }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [newDateTime, setNewDateTime] = useState(() => {
    // datetime-local format: YYYY-MM-DDTHH:MM
    const d = new Date(group.scheduled_for);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [loading, setLoading] = useState(false);

  const thumb = thumbnailUrl(group.thumbnail_path, supabaseUrl);
  const status = STATUS_META[group.status] ?? STATUS_META.scheduled;
  const providers = [...new Set(group.posts.map(p => (p.provider || "").toLowerCase()))];

  // Position: prefer right of anchor, flip left if off-screen
  const style: React.CSSProperties = {
    position: "fixed",
    top: Math.min(anchorRect.top, window.innerHeight - 360),
    left: Math.min(anchorRect.right + 8, window.innerWidth - 280),
    width: 268,
    zIndex: 50,
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onOutside);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onOutside); };
  }, [onClose]);

  async function handleReschedule() {
    if (!newDateTime) return;
    setLoading(true);
    const iso = new Date(newDateTime).toISOString();
    const res = await fetch("/api/scheduled-posts/reschedule", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ groupId: group.groupId, scheduledFor: iso }),
    });
    setLoading(false);
    if (res.ok) { onRescheduled(group.groupId, iso); onClose(); }
  }

  async function handleCancel() {
    if (!confirm("Cancel this scheduled post?")) return;
    setLoading(true);
    // Cancel all scheduled posts in the group atomically from the user's perspective.
    // Fire all deletes in parallel; if any fail with not_scheduled the post is already
    // gone or changed state — treat the whole operation as done and refresh from server.
    const scheduledPosts = group.posts.filter(p => p.status === "scheduled");
    const results = await Promise.all(
      scheduledPosts.map(post =>
        fetch(`/api/scheduled-posts/${post.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }).then(res => ({ postId: post.id, ok: res.ok, status: res.status }))
      )
    );
    setLoading(false);
    const anyNotScheduled = results.some(r => r.status === 409);
    if (anyNotScheduled) {
      // Post(s) already changed state — notify user and close; the calendar
      // will reflect true state on next page load / refresh
      alert("One or more posts in this group were no longer scheduled. The calendar will update on next refresh.");
    }
    // Remove entire group from local state regardless — any posts that were still
    // scheduled are now deleted; any that weren't scheduled weren't shown as actionable
    onCancelled(group.groupId);
    onClose();
  }

  async function handleRetry() {
    setLoading(true);
    for (const post of group.posts) {
      if (post.status !== "failed") continue;
      await fetch(`/api/scheduled-posts/${post.id}/retry`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    setLoading(false);
    onRetried(group.groupId);
    onClose();
  }

  return (
    <div ref={ref} style={style} className="rounded-2xl border border-white/[0.10] bg-[#0f0f0f] shadow-[0_20px_60px_rgba(0,0,0,0.6)] overflow-hidden">
      {/* Thumbnail */}
      <div className="relative h-20 w-full bg-white/5 overflow-hidden">
        {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gradient-to-br from-white/5 to-white/10" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <button onClick={onClose} className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center text-white/60 hover:text-white transition-colors">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="p-4 space-y-3">
        {/* Title */}
        <h3 className="text-sm font-semibold text-white leading-snug">{group.title || "Untitled"}</h3>

        {/* Platforms */}
        <div className="flex flex-wrap gap-1.5">
          {providers.map(p => (
            <span key={p} className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/60">
              <ProviderIcon provider={p} className="w-2.5 h-2.5" />
              {PROVIDER_META[p]?.label}
            </span>
          ))}
        </div>

        {/* Time + status */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-white/40">
            {new Date(group.scheduled_for).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} at {formatTime(group.scheduled_for)}
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${status.badgeClass}`}>{status.label}</span>
        </div>

        {/* Actions */}
        <div className="border-t border-white/[0.06] pt-3 space-y-2">
          {group.status === "scheduled" && (
            <>
              {rescheduling ? (
                <div className="space-y-2">
                  <input
                    type="datetime-local"
                    value={newDateTime}
                    onChange={e => setNewDateTime(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white [color-scheme:dark]"
                  />
                  <div className="flex gap-2">
                    <button onClick={handleReschedule} disabled={loading} className="flex-1 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-400 disabled:opacity-50 transition-colors">
                      {loading ? "Saving…" : "Confirm"}
                    </button>
                    <button onClick={() => setRescheduling(false)} className="flex-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:text-white transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setRescheduling(true)} className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/70 hover:bg-white/[0.08] transition-colors text-left">
                  Reschedule
                </button>
              )}
              <button onClick={handleCancel} disabled={loading} className="w-full rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors text-left disabled:opacity-50">
                Cancel post
              </button>
            </>
          )}
          {group.status === "failed" && (
            <>
              <button onClick={handleRetry} disabled={loading} className="w-full rounded-lg bg-blue-500 px-3 py-2 text-xs font-medium text-white hover:bg-blue-400 disabled:opacity-50 transition-colors">
                {loading ? "Retrying…" : "Retry"}
              </button>
              <a href="/settings?tab=connections" className="block w-full rounded-lg border border-white/10 px-3 py-2 text-xs text-white/60 hover:bg-white/[0.04] transition-colors text-center">
                Reconnect account
              </a>
            </>
          )}
          {group.status === "posted" && (
            <a href="/posted" className="block w-full rounded-lg border border-white/10 px-3 py-2 text-xs text-white/60 hover:bg-white/[0.04] transition-colors text-center">
              View on Posted page →
            </a>
          )}
          {group.status === "ig_processing" && (
            <p className="text-xs text-amber-300/70 text-center py-1">Processing on Instagram…</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/calendar/components/PostPopover.tsx
git commit -m "feat(calendar): add PostPopover with reschedule/cancel/retry actions"
```

---

## Task 8: DayOverflowPanel component

**Files:**
- Create: `src/app/calendar/components/DayOverflowPanel.tsx`

- [ ] **Step 1: Create DayOverflowPanel**

```tsx
// src/app/calendar/components/DayOverflowPanel.tsx
"use client";

import { useEffect, useRef } from "react";
import { PostGroup, PROVIDER_META, formatTime, thumbnailUrl } from "../types";

type Props = {
  groups: PostGroup[];
  anchorRect: DOMRect;
  supabaseUrl: string;
  onCardClick: (group: PostGroup, rect: DOMRect) => void;
  onClose: () => void;
};

export function DayOverflowPanel({ groups, anchorRect, supabaseUrl, onCardClick, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  const style: React.CSSProperties = {
    position: "fixed",
    top: Math.min(anchorRect.bottom + 4, window.innerHeight - 300),
    left: Math.max(4, Math.min(anchorRect.left, window.innerWidth - 240)),
    width: 232,
    zIndex: 50,
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onOutside);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onOutside); };
  }, [onClose]);

  function handleRowClick(e: React.MouseEvent, group: PostGroup) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onClose(); // close panel first
    // Small delay so the panel unmounts before popover mounts
    setTimeout(() => onCardClick(group, rect), 0);
  }

  return (
    <div ref={ref} style={style} className="rounded-2xl border border-white/[0.10] bg-[#0f0f0f] shadow-[0_20px_60px_rgba(0,0,0,0.6)] overflow-hidden">
      <div className="px-3 py-2 border-b border-white/[0.06] flex items-center justify-between">
        <span className="text-xs text-white/40 font-medium">{groups.length} posts</span>
        <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto divide-y divide-white/[0.04]">
        {groups.map(group => {
          const providers = [...new Set(group.posts.map(p => (p.provider || "").toLowerCase()))];
          const thumb = thumbnailUrl(group.thumbnail_path, supabaseUrl);
          return (
            <button
              key={group.groupId}
              onClick={e => handleRowClick(e, group)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/[0.04] transition-colors text-left"
            >
              <div className="w-7 h-7 rounded shrink-0 overflow-hidden bg-white/10">
                {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-white/5" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-white/80 truncate">{group.title || "Untitled"}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  {providers.slice(0, 3).map(p => (
                    <span key={p} className={`w-1.5 h-1.5 rounded-full ${PROVIDER_META[p]?.dotClass ?? "bg-white/30"}`} />
                  ))}
                  <span className="text-[9px] text-white/30 ml-0.5">{formatTime(group.scheduled_for)}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/calendar/components/DayOverflowPanel.tsx
git commit -m "feat(calendar): add DayOverflowPanel for month cell overflow"
```

---

## Task 9: CalendarHeader component

**Files:**
- Create: `src/app/calendar/components/CalendarHeader.tsx`

- [ ] **Step 1: Create CalendarHeader**

```tsx
// src/app/calendar/components/CalendarHeader.tsx
"use client";

import Link from "next/link";
import { PROVIDER_META } from "../types";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

type Props = {
  view: "month" | "week";
  onViewChange: (v: "month" | "week") => void;
  viewDate: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  platformFilter: string;
  onPlatformFilter: (p: string) => void;
  activePlatforms: string[];
  postCount: number;
};

function getWeekRange(date: Date): string {
  // Get Mon-Sun of the week containing date
  const day = date.getDay();
  const mon = new Date(date); mon.setDate(date.getDate() - ((day + 6) % 7));
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(mon)} – ${fmt(sun)}`;
}

export function CalendarHeader({ view, onViewChange, viewDate, onPrev, onNext, onToday, platformFilter, onPlatformFilter, activePlatforms, postCount }: Props) {
  const label = view === "month"
    ? `${MONTH_NAMES[viewDate.getMonth()]} ${viewDate.getFullYear()}`
    : getWeekRange(viewDate);

  return (
    <div className="space-y-4 mb-6">
      {/* Top row */}
      <div className="flex items-center gap-4">
        {/* Back + title */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Link href="/dashboard" className="h-8 w-8 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/10 transition-all shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          </Link>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Calendar</h1>
            <p className="text-xs text-white/35 mt-0.5">{postCount} scheduled</p>
          </div>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-0.5 shrink-0">
          {(["month", "week"] as const).map(v => (
            <button key={v} onClick={() => onViewChange(v)} className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all capitalize ${view === v ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"}`}>
              {v}
            </button>
          ))}
        </div>

        {/* Nav */}
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={onPrev} className="h-8 w-8 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/50 hover:text-white/80 hover:bg-white/10 transition-all">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          </button>
          <button onClick={onToday} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/50 hover:bg-white/10 transition-colors">Today</button>
          <span className="text-sm font-semibold min-w-[180px] text-center">{label}</span>
          <button onClick={onNext} className="h-8 w-8 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-white/50 hover:text-white/80 hover:bg-white/10 transition-all">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
          </button>
        </div>

        {/* CTA */}
        <div className="flex-1 flex justify-end">
          <Link href="/uploads" className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-white/90 transition-colors">
            New upload
          </Link>
        </div>
      </div>

      {/* Platform filter pills */}
      {activePlatforms.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => onPlatformFilter("all")} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${platformFilter === "all" ? "border-white/20 bg-white/10 text-white" : "border-white/[0.08] text-white/40 hover:border-white/15 hover:text-white/60"}`}>
            All platforms
          </button>
          {activePlatforms.map(key => (
            <button key={key} onClick={() => onPlatformFilter(key === platformFilter ? "all" : key)} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${platformFilter === key ? "border-white/20 bg-white/10 text-white" : "border-white/[0.08] text-white/40 hover:border-white/15 hover:text-white/60"}`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PROVIDER_META[key]?.dotClass ?? "bg-white/30"}`} />
              {PROVIDER_META[key]?.label ?? key}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/calendar/components/CalendarHeader.tsx
git commit -m "feat(calendar): add CalendarHeader with view toggle, nav, platform filter"
```

---

## Task 10: DayCell + MonthView

**Files:**
- Create: `src/app/calendar/components/DayCell.tsx`
- Create: `src/app/calendar/components/MonthView.tsx`

- [ ] **Step 1: Create DayCell**

DayCell is a `useDroppable` target. Its droppable id is `day-YYYY-MM-DD`.

```tsx
// src/app/calendar/components/DayCell.tsx
"use client";

import { useDroppable } from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { PostGroup, isSameDay, formatTime, PROVIDER_META, thumbnailUrl } from "../types";
import { PostCard } from "./PostCard";

const MAX_VISIBLE = 3;

function toCellId(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `day-${y}-${m}-${d}`;
}

function DraggableCard({ group, supabaseUrl, onCardClick }: { group: PostGroup; supabaseUrl: string; onCardClick: (g: PostGroup, r: DOMRect) => void }) {
  const canDrag = group.status === "scheduled";
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `group-${group.groupId}`,
    disabled: !canDrag,
    data: { group },
  });
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <div ref={setNodeRef} style={style} {...(canDrag ? { ...attributes, ...listeners } : {})}>
      <PostCard group={group} variant="compact" supabaseUrl={supabaseUrl} onClick={onCardClick} dimmed={isDragging} />
    </div>
  );
}

type Props = {
  date: Date;
  groups: PostGroup[];
  isToday: boolean;
  isPast: boolean;
  supabaseUrl: string;
  onCardClick: (group: PostGroup, rect: DOMRect) => void;
  onOverflow: (groups: PostGroup[], rect: DOMRect) => void;
};

export function DayCell({ date, groups, isToday, isPast, supabaseUrl, onCardClick, onOverflow }: Props) {
  const id = toCellId(date);
  const { setNodeRef, isOver } = useDroppable({ id });
  const visible = groups.slice(0, MAX_VISIBLE);
  const overflow = groups.length - MAX_VISIBLE;

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[140px] border-b border-r border-white/[0.04] p-2 flex flex-col gap-1 transition-colors
        ${isPast ? "opacity-50" : ""}
        ${isOver ? "bg-blue-500/[0.08] ring-1 ring-inset ring-blue-400/30" : ""}`}
    >
      {/* Day number */}
      <div className={`text-xs leading-none shrink-0 mb-0.5 self-start ${
        isToday
          ? "inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 text-white font-semibold"
          : "text-white/50"
      }`}>
        {date.getDate()}
      </div>

      {/* Cards */}
      {visible.map(group => (
        <DraggableCard key={group.groupId} group={group} supabaseUrl={supabaseUrl} onCardClick={onCardClick} />
      ))}

      {/* Overflow */}
      {overflow > 0 && (
        <button
          onClick={e => {
            e.stopPropagation();
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            onOverflow(groups, rect);
          }}
          className="text-[10px] text-white/35 hover:text-white/60 px-1 text-left transition-colors"
        >
          +{overflow} more
        </button>
      )}
    </div>
  );
}

export { toCellId };
```

- [ ] **Step 2: Create MonthView**

```tsx
// src/app/calendar/components/MonthView.tsx
"use client";

import { PostGroup, isSameDay, groupPosts } from "../types";
import { DayCell } from "./DayCell";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getMonthCells(year: number, month: number): Array<Date | null> {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  const trailing = (7 - (cells.length % 7)) % 7;
  for (let i = 0; i < trailing; i++) cells.push(null);
  return cells;
}

type Props = {
  year: number;
  month: number;
  groups: PostGroup[];
  supabaseUrl: string;
  onCardClick: (group: PostGroup, rect: DOMRect) => void;
  onOverflow: (groups: PostGroup[], rect: DOMRect) => void;
};

export function MonthView({ year, month, groups, supabaseUrl, onCardClick, onOverflow }: Props) {
  const cells = getMonthCells(year, month);
  const today = new Date();

  function getGroupsForDate(date: Date): PostGroup[] {
    return groups.filter(g => isSameDay(new Date(g.scheduled_for), date));
  }

  return (
    <div className="rounded-3xl border border-white/[0.08] bg-white/[0.025] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.4)]">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-white/[0.06]">
        {DAY_NAMES.map(day => (
          <div key={day} className="px-2 py-3 text-center text-[11px] font-medium text-white/30 uppercase tracking-wider">{day}</div>
        ))}
      </div>
      {/* Cells */}
      <div className="grid grid-cols-7">
        {cells.map((date, i) => {
          if (!date) {
            return <div key={i} className={`min-h-[140px] border-b border-r border-white/[0.04] ${i % 7 === 6 ? "border-r-0" : ""}`} />;
          }
          const isToday = isSameDay(date, today);
          const isPast = date < today && !isToday;
          const dayGroups = getGroupsForDate(date);
          return (
            <div key={i} className={i % 7 === 6 ? "border-r-0" : ""}>
              <DayCell
                date={date}
                groups={dayGroups}
                isToday={isToday}
                isPast={isPast}
                supabaseUrl={supabaseUrl}
                onCardClick={onCardClick}
                onOverflow={onOverflow}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/calendar/components/DayCell.tsx src/app/calendar/components/MonthView.tsx
git commit -m "feat(calendar): add DayCell (droppable+draggable) and MonthView grid"
```

---

## Task 11: TimeSlot + WeekView

**Files:**
- Create: `src/app/calendar/components/TimeSlot.tsx`
- Create: `src/app/calendar/components/WeekView.tsx`

- [ ] **Step 1: Create TimeSlot**

TimeSlot droppable ID format: `slot-YYYYMMDD:HH` (e.g. `slot-20260324:15`)

```tsx
// src/app/calendar/components/TimeSlot.tsx
"use client";

import { useDroppable } from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { PostGroup, isSameDay } from "../types";
import { PostCard } from "./PostCard";

export function toSlotId(date: Date, hour: number): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(hour).padStart(2, "0");
  return `slot-${y}${m}${d}:${h}`;
}

function DraggableFullCard({ group, supabaseUrl, onCardClick }: { group: PostGroup; supabaseUrl: string; onCardClick: (g: PostGroup, r: DOMRect) => void }) {
  const canDrag = group.status === "scheduled";
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `group-${group.groupId}`,
    disabled: !canDrag,
    data: { group },
  });
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;
  return (
    <div ref={setNodeRef} style={style} {...(canDrag ? { ...attributes, ...listeners } : {})}>
      <PostCard group={group} variant="full" supabaseUrl={supabaseUrl} onClick={onCardClick} dimmed={isDragging} />
    </div>
  );
}

type Props = {
  date: Date;
  hour: number;
  groups: PostGroup[];
  supabaseUrl: string;
  onCardClick: (group: PostGroup, rect: DOMRect) => void;
  isPast: boolean;
};

export function TimeSlot({ date, hour, groups, supabaseUrl, onCardClick, isPast }: Props) {
  const id = toSlotId(date, hour);
  const { setNodeRef, isOver } = useDroppable({ id });

  const slotGroups = groups.filter(g => {
    const d = new Date(g.scheduled_for);
    return isSameDay(d, date) && d.getHours() === hour;
  });

  return (
    <div
      ref={setNodeRef}
      className={`relative border-b border-white/[0.04] min-h-[48px] p-1 flex flex-col gap-1 transition-colors
        ${isPast ? "opacity-40" : ""}
        ${isOver ? "bg-blue-500/[0.08]" : ""}`}
    >
      {slotGroups.map(group => (
        <DraggableFullCard key={group.groupId} group={group} supabaseUrl={supabaseUrl} onCardClick={onCardClick} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create WeekView**

```tsx
// src/app/calendar/components/WeekView.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { PostGroup, isSameDay } from "../types";
import { TimeSlot } from "./TimeSlot";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

function getWeekDays(viewDate: Date): Date[] {
  const day = viewDate.getDay();
  const mon = new Date(viewDate);
  mon.setDate(viewDate.getDate() - ((day + 6) % 7)); // Monday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d;
  });
}

type Props = {
  viewDate: Date;
  groups: PostGroup[];
  supabaseUrl: string;
  onCardClick: (group: PostGroup, rect: DOMRect) => void;
};

export function WeekView({ viewDate, groups, supabaseUrl, onCardClick }: Props) {
  const today = new Date();
  const days = getWeekDays(viewDate);
  const [currentHour, setCurrentHour] = useState(new Date().getHours());
  const [currentMinute, setCurrentMinute] = useState(new Date().getMinutes());
  const nowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentHour(new Date().getHours());
      setCurrentMinute(new Date().getMinutes());
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Scroll to current time on mount
  useEffect(() => {
    nowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);

  return (
    <div className="rounded-3xl border border-white/[0.08] bg-white/[0.025] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.4)]">
      {/* Header row */}
      <div className="grid sticky top-0 z-10 bg-[#0a0a0a] border-b border-white/[0.06]" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
        <div className="border-r border-white/[0.04]" /> {/* time gutter */}
        {days.map((day, i) => {
          const isToday = isSameDay(day, today);
          const isPast = day < today && !isToday;
          return (
            <div key={i} className={`py-3 text-center border-r border-white/[0.04] last:border-r-0 ${isPast ? "opacity-50" : ""}`}>
              <p className="text-[10px] text-white/40 uppercase tracking-wider">{DAY_NAMES[day.getDay()]}</p>
              <p className={`text-lg font-semibold mt-0.5 ${isToday ? "text-blue-400" : "text-white/80"}`}>{day.getDate()}</p>
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div className="overflow-y-auto max-h-[calc(100vh-240px)]">
        {HOURS.map(hour => {
          const isTodayInWeek = days.some(d => isSameDay(d, today));
          return (
            <div key={hour} style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }} className="grid relative">
              {/* Hour label */}
              <div className="border-r border-white/[0.04] flex items-start justify-end pr-2 pt-1">
                <span className="text-[10px] text-white/25 tabular-nums">{formatHour(hour)}</span>
              </div>

              {/* Day columns */}
              {days.map((day, i) => {
                const isToday = isSameDay(day, today);
                const isPastCol = day < today && !isToday;
                const isPastHour = isToday && hour < currentHour;

                return (
                  <div key={i} className={`relative border-r border-white/[0.04] last:border-r-0 ${isPastCol ? "opacity-50" : ""}`}>
                    <TimeSlot
                      date={day}
                      hour={hour}
                      groups={groups}
                      supabaseUrl={supabaseUrl}
                      onCardClick={onCardClick}
                      isPast={isPastHour}
                    />
                    {/* Current time indicator */}
                    {isToday && hour === currentHour && (
                      <div
                        ref={nowRef}
                        className="absolute left-0 right-0 pointer-events-none z-10"
                        style={{ top: `${(currentMinute / 60) * 48}px` }}
                      >
                        <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 -mt-1 absolute" />
                        <div className="h-px bg-red-500 w-full" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/calendar/components/TimeSlot.tsx src/app/calendar/components/WeekView.tsx
git commit -m "feat(calendar): add TimeSlot (droppable) and WeekView (24h time grid)"
```

---

## Task 12: CardDragOverlay component

**Files:**
- Create: `src/app/calendar/components/CardDragOverlay.tsx`

This wraps `DragOverlay` from `@dnd-kit/core` and renders a floating `PostCard` during drag.

- [ ] **Step 1: Create CardDragOverlay**

```tsx
// src/app/calendar/components/CardDragOverlay.tsx
"use client";

import { DragOverlay } from "@dnd-kit/core";
import { restrictToWindowEdges } from "@dnd-kit/modifiers";
import { PostGroup } from "../types";
import { PostCard } from "./PostCard";

type Props = {
  activeGroup: PostGroup | null;
  supabaseUrl: string;
};

export function CardDragOverlay({ activeGroup, supabaseUrl }: Props) {
  return (
    <DragOverlay modifiers={[restrictToWindowEdges]} dropAnimation={null}>
      {activeGroup ? (
        <div className="w-48 shadow-[0_20px_40px_rgba(0,0,0,0.5)] rotate-1 scale-105">
          <PostCard
            group={activeGroup}
            variant="compact"
            supabaseUrl={supabaseUrl}
            onClick={() => {}}
          />
        </div>
      ) : null}
    </DragOverlay>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/calendar/components/CardDragOverlay.tsx
git commit -m "feat(calendar): add CardDragOverlay for dnd-kit DragOverlay"
```

---

## Task 13: Rewrite page.tsx — wire everything together

**Files:**
- Modify: `src/app/calendar/page.tsx` (full rewrite)

This is the final task. It wires auth, data fetch, DndContext, view state, and renders the full calendar.

- [ ] **Step 1: Rewrite `src/app/calendar/page.tsx`**

Key DnD logic:
- `activeGroup` state stores the group being dragged (set in `onDragStart`, cleared in `onDragEnd`)
- `onDragEnd` reads `over.id` to determine target cell, computes new `scheduled_for`, optimistic update, then calls API

Drop ID parsing:
- `day-2026-03-24` → extract date, preserve original time
- `slot-20260324:15` → extract date + hour, zero minutes/seconds

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { DndContext, DragStartEvent, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { supabase } from "@/app/login/supabaseClient";
import AppPageOrb from "@/components/AppPageOrb";
import { ScheduledPost, PostGroup, groupPosts, isSameDay } from "./types";
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

  const activePlatforms = [...new Set(allGroups.flatMap(g => g.posts.map(p => (p.provider || "").toLowerCase())))].filter(Boolean);

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
    // Close any open popover/overflow when dragging starts
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
      // day-YYYY-MM-DD — keep original time, update date
      const [, y, m, d] = overId.match(/^day-(\d{4})-(\d{2})-(\d{2})$/) || [];
      if (!y) return;
      const original = new Date(group.scheduled_for);
      newScheduledFor = new Date(Number(y), Number(m) - 1, Number(d), original.getHours(), original.getMinutes(), original.getSeconds());
    } else if (overId.startsWith("slot-")) {
      // slot-YYYYMMDD:HH — set exact hour, zero minutes/seconds
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

    // Optimistic update
    setPosts(prev => prev.map(p => {
      const key = p.group_id || p.id;
      if (key === groupId && p.status === "scheduled") {
        return { ...p, scheduled_for: newIso };
      }
      return p;
    }));

    // Capture original for revert before state changes
    const originalScheduledFor = group.scheduled_for;

    // API call
    fetch("/api/scheduled-posts/reschedule", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ groupId, scheduledFor: newIso }),
    }).then(res => {
      if (!res.ok) {
        // Revert optimistic update using captured original value (not closure state)
        setPosts(prev => prev.map(p => {
          const key = p.group_id || p.id;
          if (key === groupId) return { ...p, scheduled_for: originalScheduledFor };
          return p;
        }));
        // Show error — the app has no shared toast system yet, use a simple alert
        // or wire into whatever toast pattern you add (e.g. react-hot-toast)
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
```

- [ ] **Step 2: Open the app in browser and verify the calendar loads**

Navigate to `http://localhost:3000/calendar` in your browser (dev server should already be running).

Check:
- Page loads without TypeScript errors
- Month view shows your scheduled posts
- Platform filter pills appear for connected platforms
- Today's date has a blue circle
- Clicking a post card opens the popover
- Clicking "+N more" opens the overflow panel

- [ ] **Step 3: Test week view**

Click "Week" toggle in the header. Verify:
- 7 columns (Mon–Sun) with dates
- 24 hour rows with labels 12 AM through 11 PM
- Posts appear in their correct time slot
- Red current-time line appears on today's column

- [ ] **Step 4: Test drag-to-reschedule**

Grab a scheduled (blue dot) post card and drop it on a different day cell (month view). Verify:
- The card moves immediately (optimistic update)
- The API call succeeds (no revert)
- Reload the page — the post stays in its new position

- [ ] **Step 5: Test popover actions**

For a scheduled post: open popover → Reschedule → change date → Confirm. Verify post moves.
For a failed post (if you have one): open popover → Retry. Verify status dot changes to blue.

- [ ] **Step 6: Remove the old nav from `page.tsx`**

The new `page.tsx` uses `CalendarHeader` and no longer needs the nav from the old version. The old page included a full nav with logo + settings link — this is now handled by CalendarHeader's back-to-dashboard link. Verify no duplicate nav elements appear.

- [ ] **Step 7: Final commit**

```bash
git add src/app/calendar/page.tsx src/app/calendar/types.ts src/app/calendar/components/
git commit -m "feat(calendar): complete calendar redesign — month+week views, DnD, popover"
```

---

## Done

At this point the calendar redesign is complete:
- ✅ Month view with compact post cards and drag-to-reschedule (date only)
- ✅ Week view with full post cards, 24-hour time grid, and drag-to-reschedule (date + hour)
- ✅ In-place PostPopover with reschedule (datetime-local input), cancel, retry, view-on-posted actions
- ✅ DayOverflowPanel for cells with more than 3 posts
- ✅ Platform filter pills
- ✅ Today button + prev/next navigation
- ✅ Three new API endpoints: reschedule, cancel (DELETE), retry
- ✅ Optimistic updates with revert on API error
