import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";

const DEFAULT_ERROR = "Processing stopped before your video was sent. Please start it again.";

/**
 * Closes a job whose browser-side half failed (file read error, upload error,
 * start call rejected) so it doesn't sit in a non-terminal status, blocking
 * every new AI Clips job for the team until the 3-hour stale reaper fires.
 *
 * Only the statuses the browser still owns can be abandoned: `pending` on both
 * paths, plus `uploading` on the large path (audio chunks are still coming from
 * the tab). Once a workflow has been dispatched the job belongs to it, so the
 * status filter is part of the UPDATE itself and a job that moved on is left alone.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;
    const { userId, teamId } = result.ctx;

    const { data: job } = await supabaseAdmin
      .from("ai_clip_jobs")
      .select("id, user_id, team_id, processing_path, status")
      .eq("id", params.id)
      .single();

    if (!job || job.user_id !== userId || job.team_id !== teamId) {
      return NextResponse.json({ ok: false, error: "Job not found." }, { status: 404 });
    }

    const abandonable = job.processing_path === "large" ? ["pending", "uploading"] : ["pending"];

    let body: any = {};
    try { body = await req.json(); } catch {}
    const reason = String(body?.error || "").trim().slice(0, 300) || DEFAULT_ERROR;

    const { data: closed, error } = await supabaseAdmin
      .from("ai_clip_jobs")
      .update({ status: "failed", error: reason, updated_at: new Date().toISOString() })
      .eq("id", job.id)
      .in("status", abandonable)
      .select("id");

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, abandoned: (closed?.length ?? 0) > 0 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
