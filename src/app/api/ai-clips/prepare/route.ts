import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";
export const maxDuration = 30;

const MONTHLY_CREDIT_LIMIT = 300; // minutes of source video per month

export async function POST(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;
    const { userId, teamId } = result.ctx;

    // Plan gate: Team plan only
    const { data: team } = await supabaseAdmin
      .from("teams")
      .select("plan, plan_status")
      .eq("id", teamId)
      .single();

    if (
      !team ||
      team.plan !== "team" ||
      (team.plan_status !== "active" && team.plan_status !== "trialing")
    ) {
      return NextResponse.json(
        { ok: false, error: "AI Clips is available on the Team plan only." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const clip_count = Math.min(10, Math.max(3, Number(body.clip_count) || 5));
    const source_duration_minutes = Number(body.source_duration_minutes) || 0;

    if (source_duration_minutes <= 0) {
      return NextResponse.json(
        { ok: false, error: "Invalid video duration." },
        { status: 400 }
      );
    }
    if (source_duration_minutes > 600) {
      return NextResponse.json(
        { ok: false, error: "Source video exceeds the 10-hour maximum." },
        { status: 400 }
      );
    }

    // Block if a job is already actively running for this team
    const { data: activeJobs } = await supabaseAdmin
      .from("ai_clip_jobs")
      .select("id")
      .eq("team_id", teamId)
      .in("status", ["pending", "uploading", "transcribing", "detecting", "cutting"])
      .limit(1);

    if (activeJobs && activeJobs.length > 0) {
      return NextResponse.json(
        { ok: false, error: "A job is already running. Please wait for it to finish before starting another." },
        { status: 409 }
      );
    }

    // Monthly credit check
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: usageRows } = await supabaseAdmin
      .from("ai_clip_jobs")
      .select("source_duration_minutes")
      .eq("team_id", teamId)
      .neq("status", "failed")
      .gte("created_at", startOfMonth.toISOString());

    const creditsUsed = (usageRows ?? []).reduce(
      (sum, row) => sum + (row.source_duration_minutes ?? 0),
      0
    );

    if (creditsUsed + source_duration_minutes > MONTHLY_CREDIT_LIMIT) {
      const remaining = Math.max(0, MONTHLY_CREDIT_LIMIT - creditsUsed);
      return NextResponse.json(
        {
          ok: false,
          error: `Monthly credit limit reached. You have ${remaining.toFixed(0)} minutes remaining (${Math.round(creditsUsed)}/${MONTHLY_CREDIT_LIMIT} used).`,
        },
        { status: 429 }
      );
    }

    // Generate job ID and storage path up front
    const jobId = crypto.randomUUID();
    const storagePath = `${teamId}/ai_source_${jobId}.mp4`;

    // Create signed upload URL (15-minute expiry)
    const { data: signedData, error: signedErr } = await supabaseAdmin.storage
      .from("clips")
      .createSignedUploadUrl(storagePath, { upsert: false });

    if (signedErr || !signedData) {
      return NextResponse.json(
        { ok: false, error: "Failed to create upload URL." },
        { status: 500 }
      );
    }

    // Insert job row
    const { error: insertErr } = await supabaseAdmin
      .from("ai_clip_jobs")
      .insert({
        id: jobId,
        team_id: teamId,
        user_id: userId,
        source_file_path: storagePath,
        source_bucket: "clips",
        source_duration_minutes,
        clip_count,
        status: "pending",
      });

    if (insertErr) {
      return NextResponse.json(
        { ok: false, error: "Failed to create job." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      jobId,
      uploadUrl: signedData.signedUrl,
      uploadPath: storagePath,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
