import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;
    const { teamId } = result.ctx;

    const { data, error } = await supabaseAdmin
      .from("ai_clip_jobs")
      .select(
        // processing_path and result_moments_json are what the detail page needs to
        // render the large-video branch and the per-clip virality scores — without
        // them the large path renders an empty grid.
        "id, clip_count, source_duration_minutes, status, clips_generated, result_upload_ids, result_titles, result_subtitles, result_moments_json, processing_path, error, created_at, updated_at"
      )
      .eq("id", params.id)
      .eq("team_id", teamId)
      .single();

    if (error || !data) {
      return NextResponse.json({ ok: false, error: "Job not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, job: data });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
