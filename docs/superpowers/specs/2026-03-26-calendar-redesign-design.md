# Calendar Redesign — Design Spec
**Date:** 2026-03-26
**Status:** Approved
**Project:** Clip Dash (`src/app/calendar/`)

---

## Overview

Replace the existing basic monthly calendar with a full-featured content calendar supporting both month and week views, rich post cards with thumbnails, an in-place post popover, and drag-to-reschedule. Styled to match Clip Dash's dark aesthetic (`#050505` background, white/opacity text, `rounded-3xl` cards).

---

## Views

### Month View (default)
- 7-column grid (Sun→Sat), day headers across the top
- Cells: `min-h-[140px]`, taller than current to fit cards
- Day number top-left; today gets a filled blue circle
- Up to 3 compact post cards per cell; overflow shown as `+N more` — clicking this opens a **day overflow panel** (see below), not a PostPopover
- Past day columns get `opacity-50` wash
- Toggle to week view via header control

### Week View
- Header row: day abbreviation + date number (e.g. `Mon 24`); today column highlighted with subtle background tint; past day columns get `opacity-50` wash (same as month view)
- Left column: **24 hour rows**, labelled `12 AM, 1 AM, 2 AM … 11 AM, 12 PM, 1 PM … 11 PM` — each row 48px tall, representing one clock hour
- Each hour row is a droppable `TimeSlot`
- Cards snap to the nearest hour on drop
- Red horizontal line at current time, shown only in today's column; hour rows before the current time in today's column get a subtle `opacity-40` wash (past hours dimmed, future hours full opacity)
- Past day columns (not today) get the same full-column `opacity-50` wash as month view
- Toggle to month view via header control

---

## Post Card Variants

### Compact — used in month view
- 32×32 thumbnail resolved via `supabase.storage.from('clips').getPublicUrl(thumbnail_path)`; blurred gray placeholder if `thumbnail_path` is null
- Platform icon dots stacked (up to 4 shown, `+N` if more)
- Title truncated to 1 line
- Time right-aligned (`3:00 PM`)
- 1-dot status indicator:
  - `scheduled` → blue
  - `ig_processing` → amber
  - `posted` → green
  - `failed` → red
- Only `scheduled` cards are draggable; others render without drag handle

### Full — used in week view
- Full-width thumbnail banner (~48px tall) with gradient overlay; URL resolved via `supabase.storage.from('clips').getPublicUrl(thumbnail_path)`; gray gradient placeholder if null
- Platform icon + platform name (first platform in group)
- Title (1 line, semibold)
- First line of description as excerpt
- Footer: time left-aligned + status badge right-aligned
- Fixed height — not proportional to post duration

---

## Post Popover

Triggered by clicking any post card. Anchored to the card, kept in viewport. Closes on outside click or `Escape`.

**Contents:**
- Full-width thumbnail (~80px tall); resolved via public URL (same as card)
- Full title (no truncation)
- Platform row: icon + label for each platform in the group
- Scheduled date/time: `Wednesday, Mar 26 at 3:00 PM`
- Color-coded status badge

**Actions (context-sensitive by status):**
| Status | Actions |
|--------|---------|
| `scheduled` | "Reschedule" (inline native `<input type="datetime-local">` styled to match dark theme — no external date picker library; on confirm calls reschedule endpoint) · "Cancel post" (calls cancel endpoint, removes card from calendar) |
| `failed` | "Retry" (calls retry endpoint, resets to scheduled) · "Reconnect account" (→ `/settings?tab=connections`) |
| `posted` | "View on Posted page" (→ `/posted` — no group filter, user finds post in the list) |
| `ig_processing` | Read-only label "Processing…" — no actions |

## Day Overflow Panel

When `+N more` is clicked in a month view cell, a small panel opens anchored to that cell listing all posts for that day as a scrollable list. Each row shows: platform dots, title, time. Clicking a row in the list closes the panel and immediately opens the `PostPopover` for that specific post. The overflow panel is a distinct component (`DayOverflowPanel.tsx`) from `PostPopover`.

- Closes on outside click or `Escape`
- Opening a `PostPopover` from a panel row auto-closes the panel — only one of the two can be open at a time
- If both a `DayOverflowPanel` and a `PostPopover` are somehow triggered simultaneously, the `DayOverflowPanel` takes precedence and the `PostPopover` does not open until the panel is closed

---

## Drag-and-Drop

**Library:** `@dnd-kit/core` + `@dnd-kit/modifiers` + `@dnd-kit/utilities`

**Setup:**
- `DndContext` wraps the entire calendar page (both views share it)
- `useDraggable` on each `PostCard`, active only when `status === 'scheduled'`
- `useDroppable` on each `DayCell` (month) and `TimeSlot` (week)
- `DragOverlay` renders a floating copy of the card while dragging; original goes semi-transparent (`opacity-40`)
- Use `restrictToWindowEdges` modifier from `@dnd-kit/modifiers` on the `DragOverlay`

**Month view drag behavior:**
- Drop on a different `DayCell` → keeps the original time, updates date only
- e.g. dragging a 3:00 PM post from Mar 24 to Mar 27 → new `scheduled_for` = Mar 27 at 3:00 PM

**Week view drag behavior:**
- Drop on a different column (day) and/or row (hour) → updates both date and hour
- Snaps to the nearest hour (hour derived from `TimeSlot` row ID); the resulting `scheduled_for` is set to exactly the target hour with minutes and seconds zeroed out (e.g. dropping into the 3 PM slot always produces `T15:00:00`)

**On drag end:**
1. Calculate new `scheduled_for` from target cell ID
2. Optimistic update in local React state immediately
3. Call `PATCH /api/scheduled-posts/reschedule`
4. On API error: revert optimistic update + show error toast

---

## Navigation & Controls

**CalendarHeader contains:**
- Clip Dash logo / back to dashboard link
- Month/Week view toggle (pill buttons)
- Prev / Next arrows (previous/next month or week)
- **Today** button (jumps to current month or current week)
- Month label (`March 2026`) or week range (`Mar 24 – Mar 30`)
- Platform filter pills (All / YouTube / TikTok / Instagram / Facebook / LinkedIn / Bluesky / Threads)
- "New upload" CTA button (→ `/uploads`)

---

## Data

**Fetch pattern:** Same as existing calendar page — call `GET /api/team/me` with Bearer token to get `teamId`, then query Supabase directly with the anon client using `.eq("team_id", teamId)`. This relies on the team_id equality check for row isolation (consistent with the rest of the app).

**Fetch query:**
```ts
supabase
  .from("scheduled_posts")
  .select("id, title, description, provider, scheduled_for, status, group_id, thumbnail_path, platform_account_id")
  .eq("team_id", teamId)
  .in("status", ["scheduled", "ig_processing", "posted", "failed"])
  .order("scheduled_for", { ascending: true })
```

**Thumbnail URLs:** Resolve `thumbnail_path` to a public URL at render time:
```ts
supabase.storage.from("clips").getPublicUrl(thumbnail_path).data.publicUrl
```
Render a gray placeholder if `thumbnail_path` is null or empty.

**Grouping:** Posts are grouped by `group_id ?? id` — same logic as existing calendar (`const key = post.group_id || post.id`). One visual card per group; the popover shows all platforms in the group.

**Platform filter:** A group card is shown if **any** post in the group matches the active platform filter (`group.posts.some(p => p.provider === filter)`). The full group card is always shown — individual platforms within the group are not hidden.

---

## API Endpoints

### `PATCH /api/scheduled-posts/reschedule` — new endpoint

**File:** `src/app/api/scheduled-posts/reschedule/route.ts` (create new file)

Request body:
```json
{ "groupId": "abc123", "scheduledFor": "2026-03-28T15:00:00Z" }
```

Behavior:
- Authenticated via Bearer token + `getTeamContext(req)`
- `groupId` may be either a real `group_id` value or a post `id` (when `group_id` is null, the client sends the post's own `id` as the groupId)
- Update query: `WHERE team_id = teamId AND status = 'scheduled' AND (group_id = groupId OR id = groupId)`
- Returns `{ ok: true }` on success

### `DELETE /api/scheduled-posts/[id]` — cancel a scheduled post

- **This handler does not yet exist.** Add a `DELETE` export to `src/app/api/scheduled-posts/[id]/route.ts`. Do **not** modify the existing `DELETE /api/scheduled-posts` collection-level handler — that route is draft-only and used by the drafts page.
- Authenticated via Bearer token + `getTeamContext(req)`
- Only deletes if `status = 'scheduled'` AND `team_id` matches; returns HTTP 409 + `{ ok: false, error: "not_scheduled" }` if the post is in any other status
- On the client: optimistic removal before the API call; if the API returns a non-ok response, revert the removal and show a toast: "This post is no longer scheduled"
- Returns `{ ok: true }` on success

### `PATCH /api/scheduled-posts/[id]/retry` — new endpoint

**File:** `src/app/api/scheduled-posts/[id]/retry/route.ts` (create new file)

Request body: none required

Behavior:
- Authenticated via Bearer token + `getTeamContext(req)`
- Only acts on posts where `status = 'failed'` and `team_id` matches
- Sets `status = 'scheduled'`, clears `last_error = null`
- Returns `{ ok: true }`

---

## Component File Structure

```
src/app/calendar/
  page.tsx                        — auth, data fetch, view mode state, platform filter state
  components/
    CalendarHeader.tsx            — view toggle, nav, today button, platform filter pills
    MonthView.tsx                 — 7-column grid, renders DayCells
    WeekView.tsx                  — time grid (24 rows), renders TimeSlots and PostCards
    DayCell.tsx                   — droppable day cell (month view)
    TimeSlot.tsx                  — droppable 1-hour bucket (week view)
    PostCard.tsx                  — shared card, variant: "compact" | "full"
    PostPopover.tsx               — in-place popover with context-sensitive actions
    DayOverflowPanel.tsx          — panel for "+N more" overflow in month view cells
    CardDragOverlay.tsx           — floating card shown during drag (named to avoid shadowing @dnd-kit/core's DragOverlay export)
```

---

## Out of Scope

- Drafts on calendar (not shown — navigate to `/drafts` for drafts)
- "Best times" suggestions overlay (future feature)
- Import/export CSV (future feature)
- List view tab (already exists at `/scheduled`)
- Comments or analytics within calendar

---

## Dependencies

Install before starting implementation:
```bash
npm install @dnd-kit/core @dnd-kit/modifiers @dnd-kit/utilities
```

- `@dnd-kit/core` — drag-and-drop primitives (`DndContext`, `useDraggable`, `useDroppable`, `DragOverlay`)
- `@dnd-kit/modifiers` — `restrictToWindowEdges` modifier for DragOverlay
- `@dnd-kit/utilities` — CSS transform helpers for DragOverlay positioning
- No full calendar library (FullCalendar, react-big-calendar) — custom implementation for full aesthetic control
