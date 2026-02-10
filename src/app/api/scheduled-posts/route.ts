import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";

/**
 * GET /api/scheduled-posts
 * Returns the team's scheduled posts
 */
export async function GET(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;

    const { teamId } = result.ctx;

    // Fetch scheduled posts
    const { data, error } = await supabaseAdmin
      .from("scheduled_posts")
      .select("*")
      .eq("team_id", teamId)
      .order("scheduled_for", { ascending: true });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (e: any) {
    console.error("GET /api/scheduled-posts failed:", e?.message ?? e);
    return NextResponse.json(
      { ok: false, error: "Server error" },
      { status: 500 }
    );
  }
}
