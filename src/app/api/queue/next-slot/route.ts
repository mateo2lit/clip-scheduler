import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";
import type { QueueSchedule } from "../route";

export const runtime = "nodejs";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Convert a local date+time string in a given IANA timezone to a UTC Date. */
function zonedToUTC(dateStr: string, timeStr: string, tz: string): Date {
  // Treat the given date+time as UTC, then find the actual TZ offset at that moment
  const naiveMs = new Date(`${dateStr}T${timeStr}:00Z`).getTime();
  const naive = new Date(naiveMs);

  // Format the naive UTC time in the target timezone to get what "local" time it shows
  const localStr = new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(naive); // "2026-03-08 06:00:00"

  const localMs = new Date(localStr.replace(" ", "T") + "Z").getTime();
  const offsetMs = naiveMs - localMs; // positive if tz is behind UTC
  return new Date(naiveMs + offsetMs);
}

/** Get the ISO date string (YYYY-MM-DD) in a given timezone for a UTC Date. */
function dateInTZ(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d); // "2026-03-08"
}

/** Get Mon=0 … Sun=6 day index in a given timezone for a UTC Date. */
function dayIndexInTZ(d: Date, tz: string): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(d);
  return DAY_NAMES.indexOf(wd);
}

export async function GET(req: Request) {
  const result = await getTeamContext(req);
  if (!result.ok) return result.error;
  const { teamId } = result.ctx;

  const url = new URL(req.url);
  const tz = url.searchParams.get("tz") || "UTC";

  // Load queue schedule
  const { data: teamRow } = await supabaseAdmin
    .from("teams")
    .select("queue_schedule")
    .eq("id", teamId)
    .maybeSingle();

  const schedule: QueueSchedule | null = teamRow?.queue_schedule ?? null;

  if (!schedule || !schedule.slots || schedule.slots.length === 0) {
    return NextResponse.json({ ok: true, hasSchedule: false, slot: null });
  }

  // Load existing scheduled posts (future only)
  const { data: posts } = await supabaseAdmin
    .from("scheduled_posts")
    .select("scheduled_for")
    .eq("team_id", teamId)
    .eq("status", "scheduled")
    .gt("scheduled_for", new Date().toISOString());

  const takenMs = new Set(
    (posts ?? [])
      .filter((p) => p.scheduled_for)
      .map((p) => Math.round(new Date(p.scheduled_for).getTime() / 60_000)) // round to minute
  );

  const useTz = schedule.timezone || tz;
  const now = new Date();

  // Generate candidate slots for the next 28 days
  const candidates: Date[] = [];
  for (let dayOffset = 0; dayOffset < 28; dayOffset++) {
    const checkUtc = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const dayIdx = dayIndexInTZ(checkUtc, useTz);
    const dateStr = dateInTZ(checkUtc, useTz);
    if (dayIdx === -1) continue;

    for (const slot of schedule.slots) {
      if (!slot.days[dayIdx]) continue;
      let slotUtc = zonedToUTC(dateStr, slot.time, useTz);

      // Apply randomize: add 0–10 random minutes deterministically (avoid re-randomizing on each call)
      // We just add a small fixed offset based on the slot id so it's stable
      if (schedule.randomize) {
        const seed = slot.id.charCodeAt(0) % 10;
        slotUtc = new Date(slotUtc.getTime() + seed * 60_000);
      }

      // Must be at least 5 minutes in the future
      if (slotUtc.getTime() <= now.getTime() + 5 * 60_000) continue;

      candidates.push(slotUtc);
    }
  }

  candidates.sort((a, b) => a.getTime() - b.getTime());

  // Find first candidate not already taken (within ±1 minute)
  const chosenSlot = candidates.find((c) => {
    const roundedMin = Math.round(c.getTime() / 60_000);
    return !takenMs.has(roundedMin);
  });

  if (!chosenSlot) {
    return NextResponse.json({ ok: true, hasSchedule: true, slot: null, message: "No available slots in the next 28 days" });
  }

  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: useTz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(chosenSlot);

  return NextResponse.json({
    ok: true,
    hasSchedule: true,
    slot: chosenSlot.toISOString(),
    slotFormatted: formatted,
  });
}
