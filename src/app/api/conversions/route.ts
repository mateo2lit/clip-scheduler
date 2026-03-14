import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";

const GITHUB_PAT = process.env.GITHUB_PAT!;
const GITHUB_REPO = process.env.GITHUB_REPO || "mateo2lit/clip-scheduler";

export async function POST(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;
    const { userId, teamId } = result.ctx;

    // Check plan — must be active or trialing
    const { data: team } = await supabaseAdmin
      .from("teams")
      .select("plan, plan_status")
      .eq("id", teamId)
      .single();

    if (!team || (team.plan_status !== "active" && team.plan_status !== "trialing")) {
      return NextResponse.json(
        { ok: false, error: "An active plan or trial is required to convert clips." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const upload_id: string = (body.upload_id || "").trim();
    const style: string = body.style === "crop" ? "crop" : "blur";

    if (!upload_id) {
      return NextResponse.json({ ok: false, error: "upload_id is required." }, { status: 400 });
    }

    // Verify upload belongs to this team
    const { data: upload } = await supabaseAdmin
      .from("uploads")
      .select("id, file_path, file_size")
      .eq("id", upload_id)
      .eq("team_id", teamId)
      .single();

    if (!upload) {
      return NextResponse.json({ ok: false, error: "Upload not found." }, { status: 404 });
    }

    // Storage quota check
    const { data: uploads } = await supabaseAdmin
      .from("uploads")
      .select("file_size")
      .eq("team_id", teamId)
      .eq("storage_deleted", false);

    const usedBytes = uploads?.reduce((sum, r) => sum + (r.file_size || 0), 0) ?? 0;
    const limitBytes = team.plan === "team" ? 15 * 1024 ** 3 : 5 * 1024 ** 3;
    if (usedBytes > limitBytes * 0.85) {
      return NextResponse.json(
        { ok: false, error: "Storage nearly full. Delete old uploads before converting." },
        { status: 403 }
      );
    }

    // Insert vertical_conversions row
    const { data: job, error: jobErr } = await supabaseAdmin
      .from("vertical_conversions")
      .insert({
        team_id: teamId,
        user_id: userId,
        source_upload_id: upload_id,
        style,
        status: "pending",
      })
      .select("id")
      .single();

    if (jobErr || !job) {
      return NextResponse.json({ ok: false, error: "Failed to create conversion job." }, { status: 500 });
    }

    // Dispatch GitHub Actions workflow
    if (!GITHUB_PAT) {
      console.warn("GITHUB_PAT not set — conversion job created but workflow not dispatched");
    } else {
      const dispatchRes = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/process-clip.yml/dispatches`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${GITHUB_PAT}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ref: "main",
            inputs: {
              job_id: job.id,
              source_file_path: upload.file_path,
              team_id: teamId,
              user_id: userId,
              style,
            },
          }),
        }
      );

      if (!dispatchRes.ok) {
        const errText = await dispatchRes.text();
        console.error("GitHub dispatch failed:", dispatchRes.status, errText);
        return NextResponse.json(
          { ok: false, error: `Conversion worker could not be started (GitHub ${dispatchRes.status}): ${errText.slice(0, 200)}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ ok: true, jobId: job.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
