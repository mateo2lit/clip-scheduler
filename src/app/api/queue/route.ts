import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";

export type QueueSlot = {
  id: string;
  time: string;       // "HH:MM" 24h
  days: boolean[];    // [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
};

export type QueueSchedule = {
  slots: QueueSlot[];
  randomize: boolean;
  timezone: string;   // e.g. "America/New_York"
};

export async function GET(req: Request) {
  const result = await getTeamContext(req);
  if (!result.ok) return result.error;
  const { teamId } = result.ctx;

  const { data } = await supabaseAdmin
    .from("teams")
    .select("queue_schedule")
    .eq("id", teamId)
    .maybeSingle();

  return NextResponse.json({ ok: true, schedule: data?.queue_schedule ?? null });
}

export async function PUT(req: Request) {
  const result = await getTeamContext(req);
  if (!result.ok) return result.error;
  const { teamId } = result.ctx;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  const schedule: QueueSchedule = {
    slots: Array.isArray(body.slots) ? body.slots : [],
    randomize: !!body.randomize,
    timezone: typeof body.timezone === "string" ? body.timezone : "UTC",
  };

  await supabaseAdmin.from("teams").update({ queue_schedule: schedule }).eq("id", teamId);

  return NextResponse.json({ ok: true });
}
