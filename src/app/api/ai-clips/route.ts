import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;
    const { teamId } = result.ctx;

    const { data, error } = await supabaseAdmin
      .from("ai_clip_jobs")
      .select(
        "id, clip_count, source_duration_minutes, status, clips_generated, result_upload_ids, result_titles, result_subtitles, error, created_at, updated_at"
      )
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Compute credits used this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const creditsUsed = (data ?? [])
      .filter(
        (j) =>
          j.status !== "failed" &&
          new Date(j.created_at) >= startOfMonth
      )
      .reduce((sum, j) => sum + (j.source_duration_minutes ?? 0), 0);

    return NextResponse.json({ ok: true, data: data ?? [], creditsUsed });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
