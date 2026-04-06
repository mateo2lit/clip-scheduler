import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";
export const maxDuration = 30;

const GITHUB_PAT = process.env.GITHUB_PAT!;
const GITHUB_REPO = process.env.GITHUB_REPO || "mateo2lit/clip-scheduler";

export async function POST(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;
    const { userId, teamId } = result.ctx;

    // Check active plan
    const { data: team } = await supabaseAdmin
      .from("teams")
      .select("plan, plan_status")
      .eq("id", teamId)
      .single();

    if (!team || (team.plan_status !== "active" && team.plan_status !== "trialing")) {
      return NextResponse.json(
        { ok: false, error: "An active plan or trial is required." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const sourceUploadId: string = (body.sourceUploadId || "").trim();
    const overlayConfig = body.overlayConfig ?? {};

    if (!sourceUploadId) {
      return NextResponse.json({ ok: false, error: "sourceUploadId is required." }, { status: 400 });
    }

    // Verify upload belongs to this team
    const { data: upload } = await supabaseAdmin
      .from("uploads")
      .select("id, file_path, file_size")
      .eq("id", sourceUploadId)
      .eq("team_id", teamId)
      .single();

    if (!upload) {
      return NextResponse.json({ ok: false, error: "Upload not found." }, { status: 404 });
    }

    // Block if another burn job is already running for this team
    const { data: activeJobs } = await supabaseAdmin
      .from("overlay_burn_jobs")
      .select("id")
      .eq("team_id", teamId)
      .in("status", ["pending", "transcribing", "burning"])
      .limit(1);

    if (activeJobs && activeJobs.length > 0) {
      return NextResponse.json(
        { ok: false, error: "A burn job is already running. Please wait for it to finish." },
        { status: 409 }
      );
    }

    // Create job row
    const { data: job, error: jobErr } = await supabaseAdmin
      .from("overlay_burn_jobs")
      .insert({
        team_id: teamId,
        user_id: userId,
        source_upload_id: sourceUploadId,
        overlay_config: overlayConfig,
        status: "pending",
      })
      .select("id")
      .single();

    if (jobErr || !job) {
      return NextResponse.json({ ok: false, error: "Failed to create burn job." }, { status: 500 });
    }

    // Dispatch GitHub Actions workflow
    if (!GITHUB_PAT) {
      console.warn("GITHUB_PAT not set — burn job created but workflow not dispatched");
    } else {
      const dispatchRes = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/overlay-burn.yml/dispatches`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${GITHUB_PAT}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ref: "main",
            inputs: { job_id: job.id, team_id: teamId, user_id: userId },
          }),
        }
      );

      if (!dispatchRes.ok) {
        const errText = await dispatchRes.text();
        // Clean up the orphaned job row
        await supabaseAdmin.from("overlay_burn_jobs").delete().eq("id", job.id);
        return NextResponse.json(
          { ok: false, error: `Failed to start burn worker (GitHub ${dispatchRes.status}): ${errText.slice(0, 200)}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ ok: true, jobId: job.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
