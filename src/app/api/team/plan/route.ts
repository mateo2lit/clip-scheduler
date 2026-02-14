import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export async function GET(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;

    const { teamId } = result.ctx;

    const { data: team, error } = await supabaseAdmin
      .from("teams")
      .select("plan, plan_status, trial_ends_at")
      .eq("id", teamId)
      .single();

    if (error || !team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      plan: team.plan || "none",
      plan_status: team.plan_status || "inactive",
      trial_ends_at: team.trial_ends_at || null,
    });
  } catch (err: any) {
    console.error("GET /api/team/plan error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
