import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";
import { dispatchBurnWorkflow } from "@/lib/aiClipBurn";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/ai-clips/burn/[id]/retry
 *
 * Re-render a failed caption burn into the SAME reserved upload, so posts already
 * scheduled against it still go out instead of failing.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;
    const { teamId, userId } = result.ctx;

    const { data: old } = await supabaseAdmin
      .from("ai_clip_burn_jobs")
      .select("id, team_id, source_job_id, clip_index, source_clip_path, subtitle_data, subtitle_style, mode, status")
      .eq("id", params.id)
      .eq("team_id", teamId)
      .single();
    if (!old) return NextResponse.json({ ok: false, error: "Caption job not found." }, { status: 404 });
    if (old.status !== "failed") {
      return NextResponse.json({ ok: false, error: "Only failed caption jobs can be retried." }, { status: 409 });
    }

    const { data: upload } = await supabaseAdmin
      .from("uploads")
      .select("id, file_path")
      .eq("render_job_id", old.id)
      .eq("team_id", teamId)
      .single();
    if (!upload) return NextResponse.json({ ok: false, error: "Captioned video not found." }, { status: 404 });

    const { data: src } = await supabaseAdmin
      .from("uploads")
      .select("bucket")
      .eq("file_path", old.source_clip_path)
      .eq("team_id", teamId)
      .maybeSingle();
    const { data: signed } = await supabaseAdmin.storage
      .from(src?.bucket || "clips")
      .createSignedUrl(old.source_clip_path, 7200);
    if (!signed?.signedUrl) {
      return NextResponse.json({ ok: false, error: "The source clip is no longer available." }, { status: 410 });
    }

    const burnJobId = crypto.randomUUID();
    const { error: insertErr } = await supabaseAdmin.from("ai_clip_burn_jobs").insert({
      id: burnJobId,
      team_id: teamId,
      source_job_id: old.source_job_id,
      clip_index: old.clip_index,
      source_clip_path: old.source_clip_path,
      status: "pending",
      subtitle_data: old.subtitle_data,
      subtitle_style: old.subtitle_style,
      mode: old.mode,
    });
    if (insertErr) return NextResponse.json({ ok: false, error: "Failed to create caption job." }, { status: 500 });

    await supabaseAdmin
      .from("uploads")
      .update({ render_status: "rendering", render_job_id: burnJobId, render_started_at: new Date().toISOString() })
      .eq("id", upload.id);

    const { data: job } = await supabaseAdmin
      .from("ai_clip_jobs")
      .select("result_titles")
      .eq("id", old.source_job_id)
      .maybeSingle();

    await dispatchBurnWorkflow({
      burn_job_id: burnJobId,
      source_clip_url: signed.signedUrl,
      output_path: upload.file_path,
      mode: old.mode,
      team_id: teamId,
      user_id: userId,
      clip_title: (job?.result_titles as string[] | null)?.[old.clip_index] ?? `Clip ${old.clip_index + 1}`,
      upload_id: upload.id,
    });

    return NextResponse.json({ ok: true, burnJobId, uploadId: upload.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
