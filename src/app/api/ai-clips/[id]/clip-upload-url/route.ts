import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";

/**
 * Signed upload URL for one clip a browser cut from a large-file job. Issued
 * server-side, like /api/ai-clips/prepare does for the small path, so the
 * upload doesn't depend on the user's own Storage permissions.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;
    const { teamId } = result.ctx;

    const body = await req.json().catch(() => null);
    const index = Number(body?.index);
    if (!Number.isInteger(index) || index < 0 || index > 50) {
      return NextResponse.json({ ok: false, error: "Bad clip index." }, { status: 400 });
    }

    const { data: job } = await supabaseAdmin
      .from("ai_clip_jobs")
      .select("id, status, processing_path")
      .eq("id", params.id)
      .eq("team_id", teamId)
      .single();
    if (!job) return NextResponse.json({ ok: false, error: "Job not found." }, { status: 404 });
    if (job.processing_path !== "large" || job.status !== "done") {
      return NextResponse.json({ ok: false, error: "This job isn't waiting for clips." }, { status: 409 });
    }

    // Timestamped so a retry never collides with an earlier attempt's object.
    const path = `${teamId}/ai_${job.id}_${index}_${Date.now()}.mp4`;
    const { data, error } = await supabaseAdmin.storage.from("clips").createSignedUploadUrl(path);
    if (error || !data) {
      return NextResponse.json({ ok: false, error: error?.message || "Could not create upload URL." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, path, uploadUrl: data.signedUrl });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
