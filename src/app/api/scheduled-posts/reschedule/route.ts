import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";

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
