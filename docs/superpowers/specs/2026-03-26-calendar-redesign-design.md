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
- Up to 3 compact post cards per cell; overflow shown as `+N more` (clicking opens popover listing all)
- Past day columns get `opacity-50` wash
- Toggle to week view via header control

### Week View
- Header row: day abbreviation + date number (e.g. `Mon 24`); today column highlighted with subtle background
- Left column: hour labels **12 AM → 11 PM** (full 24-hour range)
- Each hour row is a droppable `TimeSlot` — 48px tall
- Cards snap to the nearest hour on drop
- Red horizontal line at current time, shown only in today's column
- Toggle to month view via header control

---

## Post Card Variants

### Compact — used in month view
- 32×32 thumbnail (blurred gray placeholder if no `thumbnail_path`)
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
- Full-width thumbnail banner (~48px tall) with gradient overlay
- Platform icon + platform name (first platform in group)
- Title (1 line, semibold)
- First line of description as excerpt
- Footer: time left-aligned + status badge right-aligned
- Fixed height — not proportional to post duration

---

## Post Popover

Triggered by clicking any post card. Anchored to the card, kept in viewport. Closes on outside click or `Escape`.

**Contents:**
- Full-width thumbnail (~80px tall)
- Full title (no truncation)
- Platform row: icon + label for each platform in the group
- Scheduled date/time: `Wednesday, Mar 26 at 3:00 PM`
- Color-coded status badge

**Actions (context-sensitive by status):**
| Status | Actions |
|--------|---------|
| `scheduled` | "Reschedule" (inline date+time picker) · "Cancel post" |
| `failed` | "Retry" (re-queues) · "Reconnect account" (→ `/settings?tab=connections`) |
| `posted` | "View details" (→ `/posted` filtered to group) |
| `ig_processing` | Read-only label "Processing…" |

---

## Drag-and-Drop

**Library:** `@dnd-kit/core`

**Setup:**
- `DndContext` wraps the entire calendar page (both views share it)
- `useDraggable` on each `PostCard`, active only when `status === 'scheduled'`
- `useDroppable` on each `DayCell` (month) and `TimeSlot` (week)
- `DragOverlay` renders a floating copy of the card while dragging; original goes semi-transparent (`opacity-40`)

**Month view drag behavior:**
- Drop on a different `DayCell` → keeps the original time, updates date only
- e.g. dragging a 3:00 PM post from Mar 24 to Mar 27 → new `scheduled_for` = Mar 27 at 3:00 PM

**Week view drag behavior:**
- Drop on a different column (day) and/or row (hour) → updates both date and hour
- Snaps to the nearest hour

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

**Fetch query:**
```ts
supabase
  .from("scheduled_posts")
  .select("id, title, description, provider, scheduled_for, status, group_id, thumbnail_path, platform_account_id")
  .eq("team_id", teamId)
  .in("status", ["scheduled", "ig_processing", "posted", "failed"])
  .order("scheduled_for", { ascending: true })
```

**Grouping:** Posts are grouped by `group_id` (or `id` if no group) — same logic as existing calendar. One visual card per group; the popover shows all platforms in the group.

---

## New API Endpoint

**`PATCH /api/scheduled-posts/reschedule`**

Request body:
```json
{ "groupId": "abc123", "scheduledFor": "2026-03-28T15:00:00Z" }
```

Behavior:
- Authenticated via Bearer token + `getTeamContext(req)`
- Updates all `scheduled_posts` rows where `group_id = groupId` AND `team_id = teamId` AND `status = 'scheduled'`
- Returns `{ ok: true }` on success

---

## Component File Structure

```
src/app/calendar/
  page.tsx                        — auth, data fetch, view mode state, platform filter state
  components/
    CalendarHeader.tsx            — view toggle, nav, today button, platform filter pills
    MonthView.tsx                 — 7-column grid, renders DayCells
    WeekView.tsx                  — time grid, renders TimeSlots and PostCards
    DayCell.tsx                   — droppable day cell (month view)
    TimeSlot.tsx                  — droppable 1-hour bucket (week view)
    PostCard.tsx                  — shared card, variant: "compact" | "full"
    PostPopover.tsx               — in-place popover with actions
    DragOverlay.tsx               — floating card shown during drag
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

- `@dnd-kit/core` — drag-and-drop
- `@dnd-kit/utilities` — CSS transform helpers for DragOverlay
- No full calendar library (FullCalendar, react-big-calendar) — custom implementation for full aesthetic control
