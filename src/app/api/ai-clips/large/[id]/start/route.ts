// src/app/api/ai-clips/large/[id]/start/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";
export const maxDuration = 30;

const GITHUB_API = "https://api.github.com";
const TRANSCRIBE_WORKFLOW_FILENAME = "ai-clips-transcribe-chunk.yml";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;
    const { userId, teamId } = result.ctx;

    const jobId = params.id;
    if (!jobId) return NextResponse.json({ ok: false, error: "missing job id" }, { status: 400 });

    const { data: job } = await supabaseAdmin
      .from("ai_clip_jobs")
      .select("id, user_id, team_id, processing_path, status")
      .eq("id", jobId)
      .single();

    if (!job || job.user_id !== userId || job.team_id !== teamId) {
      return NextResponse.json({ ok: false, error: "job not found" }, { status: 404 });
    }
    if (job.processing_path !== "large") {
      return NextResponse.json({ ok: false, error: "wrong processing path" }, { status: 400 });
    }
    if (job.status !== "uploading") {
      return NextResponse.json({ ok: false, error: `job not in uploading state (status=${job.status})` }, { status: 409 });
    }

    // Count actual chunks present
    const { data: chunks } = await supabaseAdmin
      .from("ai_clip_audio_chunks")
      .select("chunk_index")
      .eq("job_id", jobId);

    if (!chunks || chunks.length === 0) {
      return NextResponse.json({ ok: false, error: "no chunks uploaded" }, { status: 400 });
    }

    // Verify contiguous from 0..N-1
    const indices = chunks.map((c) => c.chunk_index).sort((a, b) => a - b);
    for (let i = 0; i < indices.length; i++) {
      if (indices[i] !== i) {
        return NextResponse.json({ ok: false, error: `missing chunk at index ${i}` }, { status: 400 });
      }
    }
    const chunksTotal = indices.length;

    // Commit job: set total + transcribing
    await supabaseAdmin
      .from("ai_clip_jobs")
      .update({
        audio_chunks_total: chunksTotal,
        status: "transcribing",
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    // Dispatch matrix workflow
    const ghPat = process.env.GITHUB_PAT;
    const ghRepo = process.env.GITHUB_REPO;  // e.g. "mateo2lit/clip-scheduler"
    if (!ghPat || !ghRepo) {
      return NextResponse.json({ ok: false, error: "github dispatch env not configured" }, { status: 500 });
    }

    const dispatchRes = await fetch(
      `${GITHUB_API}/repos/${ghRepo}/actions/workflows/${TRANSCRIBE_WORKFLOW_FILENAME}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ghPat}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          ref: "main",
          inputs: {
            job_id: jobId,
            chunks_total: String(chunksTotal),
          },
        }),
      }
    );

    if (!dispatchRes.ok) {
      const body = await dispatchRes.text();
      // Roll back to uploading so user can retry
      await supabaseAdmin
        .from("ai_clip_jobs")
        .update({ status: "uploading", updated_at: new Date().toISOString() })
        .eq("id", jobId);
      return NextResponse.json(
        { ok: false, error: `dispatch failed: ${dispatchRes.status} ${body}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, chunksTotal });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
