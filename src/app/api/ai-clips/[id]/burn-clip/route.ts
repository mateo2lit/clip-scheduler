import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";
import { BURN_MODES, dispatchBurnWorkflow } from "@/lib/aiClipBurn";

export const runtime = "nodejs";
export const maxDuration = 30;

const GITHUB_PAT = process.env.GITHUB_PAT;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;
    const { teamId, userId } = result.ctx;

    const { data: job } = await supabaseAdmin
      .from("ai_clip_jobs")
      .select("id, team_id, status, result_upload_ids, result_subtitles, result_titles")
      .eq("id", params.id)
      .eq("team_id", teamId)
      .single();

    if (!job) {
      return NextResponse.json({ ok: false, error: "Job not found." }, { status: 404 });
    }
    if (job.status !== "done") {
      return NextResponse.json(
        { ok: false, error: "Job not complete yet." },
        { status: 409 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const clip_index = Number(body.clip_index ?? 0);
    const subtitle_style = body.subtitle_style ?? {};
    const requestedMode = (body.mode as string) || "landscape";
    if (!BURN_MODES.includes(requestedMode as (typeof BURN_MODES)[number])) {
      return NextResponse.json(
        { ok: false, error: `Unsupported output format: ${requestedMode}` },
        { status: 400 }
      );
    }
    const mode = requestedMode;

    const uploadIds: string[] = job.result_upload_ids ?? [];
    if (clip_index < 0 || clip_index >= uploadIds.length) {
      return NextResponse.json({ ok: false, error: "Invalid clip index." }, { status: 400 });
    }

    const subtitles: any[] = job.result_subtitles ?? [];
    const clipSubtitles = subtitles[clip_index] ?? [];
    const clipTitle = (job.result_titles as string[] | null)?.[clip_index] ?? `Clip ${clip_index + 1}`;

    // Look up the source clip's storage path from the uploads row
    const uploadId = uploadIds[clip_index];
    const { data: upload } = await supabaseAdmin
      .from("uploads")
      .select("file_path, bucket")
      .eq("id", uploadId)
      .eq("team_id", teamId)
      .single();

    if (!upload) {
      return NextResponse.json({ ok: false, error: "Clip upload not found." }, { status: 404 });
    }

    // Generate a signed URL for the source clip (valid 2h — enough for any queue wait + run time)
    const { data: signedData, error: signErr } = await supabaseAdmin.storage
      .from(upload.bucket)
      .createSignedUrl(upload.file_path, 7200);

    if (signErr || !signedData?.signedUrl) {
      return NextResponse.json({ ok: false, error: "Failed to generate signed URL for source clip." }, { status: 500 });
    }

    const burnJobId = crypto.randomUUID();
    const burnedPath = `${teamId}/ai_burned_${burnJobId}.mp4`;

    // Create burn job row — store subtitle_data, subtitle_style, and mode in DB
    const { error: insertErr } = await supabaseAdmin.from("ai_clip_burn_jobs").insert({
      id: burnJobId,
      team_id: teamId,
      source_job_id: params.id,
      clip_index,
      source_clip_path: upload.file_path,
      status: "pending",
      subtitle_data: clipSubtitles,
      subtitle_style: subtitle_style,
      mode: mode,
    });

    if (insertErr) {
      return NextResponse.json({ ok: false, error: "Failed to create burn job." }, { status: 500 });
    }

    // Reserve the captioned upload now, so the user can schedule it while it renders.
    // The workflow fills in file_size and clears render_status when the file is ready.
    const reservedUploadId = crypto.randomUUID();
    const { error: reserveErr } = await supabaseAdmin.from("uploads").insert({
      id: reservedUploadId,
      user_id: userId,
      team_id: teamId,
      bucket: "clips",
      file_path: burnedPath,
      file_size: null,
      storage_deleted: false,
      render_status: "rendering",
      render_job_id: burnJobId,
      render_started_at: new Date().toISOString(),
    });
    if (reserveErr) {
      return NextResponse.json({ ok: false, error: "Failed to reserve the captioned video." }, { status: 500 });
    }

    // Dispatch burn workflow — pass signed URL so the runner doesn't need Storage auth
    if (GITHUB_PAT) {
      await dispatchBurnWorkflow({
        burn_job_id: burnJobId,
        source_clip_url: signedData.signedUrl,
        output_path: burnedPath,
        mode: mode,
        team_id: teamId,
        user_id: userId,
        clip_title: clipTitle,
        upload_id: reservedUploadId,
      });
    } else {
      console.warn("GITHUB_PAT not set — burn workflow not dispatched");
    }

    return NextResponse.json({ ok: true, burnJobId, uploadId: reservedUploadId });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
