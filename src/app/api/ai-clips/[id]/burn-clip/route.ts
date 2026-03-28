import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";
export const maxDuration = 30;

const GITHUB_PAT = process.env.GITHUB_PAT!;
const GITHUB_REPO = process.env.GITHUB_REPO || "mateo2lit/clip-scheduler";

async function dispatchBurnWorkflow(inputs: Record<string, string>) {
  if (!GITHUB_PAT) throw new Error("GITHUB_PAT not set.");
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/ai-clip-burn.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_PAT}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main", inputs }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub dispatch failed (${res.status}): ${err.slice(0, 200)}`);
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;
    const { teamId, userId } = result.ctx;

    const { data: job } = await supabaseAdmin
      .from("ai_clip_jobs")
      .select("id, team_id, status, result_upload_ids, result_subtitles")
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
    const mode = (body.mode as string) || "landscape";

    const uploadIds: string[] = job.result_upload_ids ?? [];
    if (clip_index < 0 || clip_index >= uploadIds.length) {
      return NextResponse.json({ ok: false, error: "Invalid clip index." }, { status: 400 });
    }

    const subtitles: any[] = job.result_subtitles ?? [];
    const clipSubtitles = subtitles[clip_index] ?? [];

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

    // Dispatch burn workflow — pass signed URL so the runner doesn't need Storage auth
    if (GITHUB_PAT) {
      await dispatchBurnWorkflow({
        burn_job_id: burnJobId,
        source_clip_url: signedData.signedUrl,
        output_path: burnedPath,
        mode: mode,
        team_id: teamId,
        user_id: userId,
      });
    } else {
      console.warn("GITHUB_PAT not set — burn workflow not dispatched");
    }

    return NextResponse.json({ ok: true, burnJobId });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
