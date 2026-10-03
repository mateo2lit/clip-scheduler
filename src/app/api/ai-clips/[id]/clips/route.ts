import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";
import { clipResultsFromMoments } from "@/lib/aiClips/clipResults";

export const runtime = "nodejs";

/**
 * Attaches the clips a browser cut for a large-file job (one per moment, in
 * result_moments_json order) so the project renders like a small-file job.
 * Titles and subtitles come from the job's own moments, not the request; the
 * browser only says which upload is which clip and where each clip really
 * starts (the keyframe it was cut on).
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;
    const { teamId } = result.ctx;

    const body = await req.json().catch(() => null);
    const clips: { upload_id: string; start_sec: number }[] = Array.isArray(body?.clips) ? body.clips : [];

    const { data: job } = await supabaseAdmin
      .from("ai_clip_jobs")
      .select("id, team_id, status, processing_path, result_moments_json")
      .eq("id", params.id)
      .eq("team_id", teamId)
      .single();

    if (!job) return NextResponse.json({ ok: false, error: "Job not found." }, { status: 404 });
    if (job.processing_path !== "large" || job.status !== "done") {
      return NextResponse.json({ ok: false, error: "This job isn't waiting for clips." }, { status: 409 });
    }

    const moments = Array.isArray(job.result_moments_json) ? job.result_moments_json : [];
    if (!moments.length || clips.length !== moments.length) {
      return NextResponse.json({ ok: false, error: "Expected one clip per moment." }, { status: 400 });
    }

    const uploadIds = clips.map((c) => String(c.upload_id));
    const { data: owned } = await supabaseAdmin
      .from("uploads")
      .select("id")
      .eq("team_id", teamId)
      .in("id", uploadIds);
    if ((owned?.length ?? 0) !== new Set(uploadIds).size) {
      return NextResponse.json({ ok: false, error: "Unknown upload." }, { status: 400 });
    }

    const { titles, subtitles } = clipResultsFromMoments(moments, clips.map((c) => Number(c.start_sec)));

    const { error } = await supabaseAdmin
      .from("ai_clip_jobs")
      .update({
        result_upload_ids: uploadIds,
        result_titles: titles,
        result_subtitles: subtitles,
        clips_generated: uploadIds.length,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
