import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";
export const maxDuration = 30;

const GITHUB_PAT = process.env.GITHUB_PAT!;
const GITHUB_REPO = process.env.GITHUB_REPO || "mateo2lit/clip-scheduler";

const ALLOWED_DOMAINS = ["youtube.com", "youtu.be", "twitch.tv", "www.youtube.com", "www.twitch.tv", "m.youtube.com", "m.twitch.tv"];

function isAllowedUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return ALLOWED_DOMAINS.some((d) => url.hostname === d || url.hostname.endsWith("." + d));
  } catch {
    return false;
  }
}

async function dispatchWorkflow(inputs: Record<string, string>) {
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
    const source_url: string = (body.source_url || "").trim();

    if (!source_url) {
      return NextResponse.json({ ok: false, error: "URL is required." }, { status: 400 });
    }
    if (!isAllowedUrl(source_url)) {
      return NextResponse.json(
        { ok: false, error: "Only YouTube and Twitch URLs are supported." },
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
        { ok: false, error: "A job is already running. Please wait for it to finish." },
        { status: 409 }
      );
    }

    const jobId = crypto.randomUUID();

    // Insert job row (no source_file_path for URL jobs)
    const { error: insertErr } = await supabaseAdmin
      .from("ai_clip_jobs")
      .insert({
        id: jobId,
        team_id: teamId,
        user_id: userId,
        source_file_path: "",
        source_bucket: "clips",
        source_duration_minutes: 0,
        clip_count,
        status: "uploading", // show as uploading while yt-dlp downloads
        source_url,
      });

    if (insertErr) {
      return NextResponse.json({ ok: false, error: "Failed to create job." }, { status: 500 });
    }

    // Dispatch workflow immediately (no file upload needed)
    if (GITHUB_PAT) {
      await dispatchWorkflow({
        job_id: jobId,
        source_file_path: "",
        source_bucket: "clips",
        source_url,
        team_id: teamId,
        user_id: userId,
        clip_count: String(clip_count),
      });
    } else {
      console.warn("GITHUB_PAT not set — ai-clips workflow not dispatched");
    }

    return NextResponse.json({ ok: true, jobId });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
