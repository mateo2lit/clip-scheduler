import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";
import { storageLimitBytes } from "@/lib/storageLimits";
import {
  cloudImportSizeError,
  dispatchCloudImportWorkflow,
  parseCloudImportRequest,
  secretFor,
  titleFromFileName,
  verifyCloudFile,
} from "@/lib/cloudImport";

export const runtime = "nodejs";
export const maxDuration = 60;

// ─── POST /api/imports/cloud ──────────────────────────────────────────────────
// Body: { source: "gdrive", fileId, accessToken } or { source: "dropbox", link, name, bytes }

export async function POST(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;
    const { userId, teamId } = result.ctx;

    const { data: team } = await supabaseAdmin
      .from("teams")
      .select("plan, plan_status")
      .eq("id", teamId)
      .single();

    if (!team || (team.plan_status !== "active" && team.plan_status !== "trialing")) {
      return NextResponse.json(
        { ok: false, error: "An active plan or trial is required to import videos." },
        { status: 403 }
      );
    }

    const parsed = parseCloudImportRequest(await req.json().catch(() => ({})));
    if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
    const request = parsed.value;

    const verified = await verifyCloudFile(request);
    if (!verified.ok) return NextResponse.json({ ok: false, error: verified.error }, { status: verified.status });
    const file = verified.value;

    const { data: uploads } = await supabaseAdmin
      .from("uploads")
      .select("file_size")
      .eq("team_id", teamId)
      .eq("storage_deleted", false);
    const usedBytes = uploads?.reduce((s, r) => s + (r.file_size || 0), 0) ?? 0;
    const sizeError = cloudImportSizeError(file.size, usedBytes, storageLimitBytes(team.plan));
    if (sizeError) return NextResponse.json({ ok: false, error: sizeError }, { status: 403 });

    const title = titleFromFileName(file.name);
    const { data: job, error: jobErr } = await supabaseAdmin
      .from("import_jobs")
      .insert({
        team_id: teamId,
        user_id: userId,
        // A label only; the download credential is stored separately below.
        url: `${request.source}:${file.name}`.slice(0, 500),
        source_platform: request.source,
        source_file_id: file.fileId,
        source_file_name: file.name,
        file_size: file.size,
        title,
        status: "pending",
      })
      .select("id")
      .single();

    if (jobErr || !job) {
      return NextResponse.json({ ok: false, error: "Failed to create import job." }, { status: 500 });
    }

    const markFailed = async (error: string) => {
      await supabaseAdmin.from("import_job_secrets").delete().eq("job_id", job.id);
      await supabaseAdmin.from("import_jobs").update({ status: "failed", error }).eq("id", job.id);
    };

    const { error: secretErr } = await supabaseAdmin
      .from("import_job_secrets")
      .insert({ job_id: job.id, secret: secretFor(request) });
    if (secretErr) {
      await markFailed("Couldn't start the import.");
      return NextResponse.json({ ok: false, error: "Failed to create import job." }, { status: 500 });
    }

    try {
      await dispatchCloudImportWorkflow(job.id);
    } catch (e: any) {
      console.error("[imports/cloud] dispatch failed:", e?.message);
      await markFailed("Couldn't start the import worker. Try again.");
      return NextResponse.json({ ok: false, error: "Couldn't start the import worker. Try again." }, { status: 502 });
    }

    return NextResponse.json({ ok: true, jobId: job.id, platform: request.source, title });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
