import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";

/**
 * DELETE /api/scheduled-posts?groupId=xxx
 * Deletes all draft posts belonging to the given group (or single post if ungrouped).
 * Only deletes posts with status = 'draft' owned by the caller's team.
 */
export async function DELETE(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;

    const { teamId } = result.ctx;
    const { searchParams } = new URL(req.url);
    const groupId = searchParams.get("groupId");

    if (!groupId) {
      return NextResponse.json({ ok: false, error: "groupId is required" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("scheduled_posts")
      .delete()
      .eq("team_id", teamId)
      .eq("status", "draft")
      .or(`group_id.eq.${groupId},and(id.eq.${groupId},group_id.is.null)`);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("DELETE /api/scheduled-posts failed:", e?.message ?? e);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}

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
