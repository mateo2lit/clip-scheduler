import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";

const GITHUB_PAT = process.env.GITHUB_PAT!;
const GITHUB_REPO = process.env.GITHUB_REPO || "mateo2lit/clip-scheduler";

function detectPlatform(url: string): string {
  if (/clips\.twitch\.tv|twitch\.tv\/\w+\/clip/i.test(url)) return "twitch";
  if (/kick\.com/i.test(url)) return "kick";
  if (/youtube\.com|youtu\.be/i.test(url)) return "youtube";
  if (/reddit\.com/i.test(url)) return "reddit";
  if (/vimeo\.com/i.test(url)) return "vimeo";
  return "unknown";
}

const BLOCKED_DOMAINS = ["instagram.com", "tiktok.com", "facebook.com", "youtube.com", "youtu.be"];

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
        { ok: false, error: "An active plan or trial is required to import clips." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const url: string = (body.url || "").trim();

    if (!url) {
      return NextResponse.json({ ok: false, error: "URL is required." }, { status: 400 });
    }

    // Basic URL validation
    try { new URL(url); } catch {
      return NextResponse.json({ ok: false, error: "Invalid URL." }, { status: 400 });
    }

    // Block platforms we post TO (no point importing from them)
    if (BLOCKED_DOMAINS.some((d) => url.includes(d))) {
      return NextResponse.json(
        { ok: false, error: "Importing from YouTube, Instagram, TikTok, or Facebook is not supported. Use Twitch or Kick links." },
        { status: 400 }
      );
    }

    // Storage quota check — warn if >80% full
    const { data: uploads } = await supabaseAdmin
      .from("uploads")
      .select("file_size")
      .eq("team_id", teamId)
      .eq("storage_deleted", false);

    const usedBytes = uploads?.reduce((sum, r) => sum + (r.file_size || 0), 0) ?? 0;
    const limitBytes = team.plan === "team" ? 15 * 1024 ** 3 : 5 * 1024 ** 3;
    if (usedBytes > limitBytes * 0.85) {
      return NextResponse.json(
        { ok: false, error: "Storage nearly full. Delete old uploads before importing." },
        { status: 403 }
      );
    }

    const sourcePlatform = detectPlatform(url);

    // For Kick: prefetch direct CDN URL from Vercel Edge (Cloudflare IPs aren't blocked by Kick;
    // GitHub Actions datacenter IPs are). Without the direct URL the workflow will always 403.
    let kickDirectUrl: string | null = null;
    let kickTitle: string | null = null;
    let kickDuration: number | null = null;

    if (sourcePlatform === "kick") {
      const clipIdMatch = url.match(/clips\/([a-zA-Z0-9_-]+)/i);
      const clipId = clipIdMatch?.[1];
      if (!clipId) {
        return NextResponse.json({ ok: false, error: "Could not parse Kick clip ID from URL." }, { status: 400 });
      }
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://clipdash.org";
      const workerSecret = process.env.WORKER_SECRET || "";
      try {
        const abort = new AbortController();
        const timeout = setTimeout(() => abort.abort(), 8000);
        const proxyRes = await fetch(
          `${siteUrl}/api/kick-proxy?token=${encodeURIComponent(workerSecret)}&clipId=${encodeURIComponent(clipId)}&url=${encodeURIComponent(url)}`,
          { signal: abort.signal }
        );
        clearTimeout(timeout);
        const d = await proxyRes.json() as any;
        if (d.ok && d.clip_url) {
          kickDirectUrl = d.clip_url;
          kickTitle = d.title ?? null;
          kickDuration = typeof d.duration === "number" ? d.duration : null;
        }
      } catch {}

      if (!kickDirectUrl) {
        return NextResponse.json(
          { ok: false, error: "Could not fetch Kick clip metadata — the clip may be private, deleted, or Kick's API is temporarily unavailable." },
          { status: 502 }
        );
      }
    }

    // Create import job
    const { data: job, error: jobErr } = await supabaseAdmin
      .from("import_jobs")
      .insert({
        team_id: teamId,
        user_id: userId,
        url,
        source_platform: sourcePlatform,
        status: "pending",
        ...(kickTitle ? { title: kickTitle } : {}),
        ...(kickDuration ? { duration_seconds: kickDuration } : {}),
      })
      .select("id")
      .single();

    if (jobErr || !job) {
      return NextResponse.json({ ok: false, error: "Failed to create import job." }, { status: 500 });
    }

    // Dispatch GitHub Actions workflow
    if (!GITHUB_PAT) {
      // Dev fallback — skip dispatch, job stays pending
      console.warn("GITHUB_PAT not set — import job created but workflow not dispatched");
    } else {
      const dispatchRes = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/import-clip.yml/dispatches`,
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
              url,
              team_id: teamId,
              user_id: userId,
              ...(kickDirectUrl ? { direct_url: kickDirectUrl } : {}),
              ...(kickTitle ? { prefetched_title: kickTitle } : {}),
              ...(kickDuration != null ? { prefetched_duration: String(kickDuration) } : {}),
            },
          }),
        }
      );

      if (!dispatchRes.ok) {
        const errText = await dispatchRes.text();
        console.error("GitHub dispatch failed:", dispatchRes.status, errText);
        return NextResponse.json(
          { ok: false, error: `Import worker could not be started (GitHub ${dispatchRes.status}): ${errText.slice(0, 200)}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ ok: true, jobId: job.id, platform: sourcePlatform });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;
    const { teamId } = result.ctx;

    const { data, error } = await supabaseAdmin
      .from("import_jobs")
      .select("id, url, source_platform, title, duration_seconds, status, error, upload_id, created_at")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
