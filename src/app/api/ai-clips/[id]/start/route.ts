import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";
export const maxDuration = 30;

const GITHUB_PAT = process.env.GITHUB_PAT!;
const GITHUB_REPO = process.env.GITHUB_REPO || "mateo2lit/clip-scheduler";

async function dispatchWorkflow(inputs: Record<string, string>) {
  if (!GITHUB_PAT) throw new Error("GITHUB_PAT not set.");
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/ai-clips.yml/dispatches`,
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

    // Fetch job and verify ownership
    const { data: job } = await supabaseAdmin
      .from("ai_clip_jobs")
      .select("id, team_id, status, source_file_path, source_bucket, clip_count")
      .eq("id", params.id)
      .eq("team_id", teamId)
      .single();

    if (!job) {
      return NextResponse.json({ ok: false, error: "Job not found." }, { status: 404 });
    }
    if (job.status !== "pending") {
      return NextResponse.json(
        { ok: false, error: "Job already started or completed." },
        { status: 409 }
      );
    }

    // Verify source file exists in Storage
    const { data: fileList } = await supabaseAdmin.storage
      .from(job.source_bucket)
      .list(job.source_file_path.split("/").slice(0, -1).join("/"), {
        search: job.source_file_path.split("/").pop(),
        limit: 1,
      });

    if (!fileList || fileList.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Source file not found in storage. Please re-upload." },
        { status: 400 }
      );
    }

    // Update status to uploading (workflow will update further)
    await supabaseAdmin
      .from("ai_clip_jobs")
      .update({ status: "uploading", updated_at: new Date().toISOString() })
      .eq("id", job.id);

    // Dispatch GitHub Actions workflow
    if (GITHUB_PAT) {
      await dispatchWorkflow({
        job_id: job.id,
        source_file_path: job.source_file_path,
        source_bucket: job.source_bucket,
        team_id: teamId,
        user_id: userId,
        clip_count: String(job.clip_count),
      });
    } else {
      console.warn("GITHUB_PAT not set — ai-clips workflow not dispatched");
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
