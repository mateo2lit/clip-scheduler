import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";
export const maxDuration = 60;

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

async function dispatchGitHubActions(inputs: Record<string, string>) {
  if (!GITHUB_PAT) throw new Error("GITHUB_PAT not set.");
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/import-clip.yml/dispatches`,
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

// ─── POST /api/imports ────────────────────────────────────────────────────────

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
        { ok: false, error: "An active plan or trial is required to import clips." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const url: string = (body.url || "").trim();
    if (!url) return NextResponse.json({ ok: false, error: "URL is required." }, { status: 400 });
    try { new URL(url); } catch {
      return NextResponse.json({ ok: false, error: "Invalid URL." }, { status: 400 });
    }
    if (BLOCKED_DOMAINS.some((d) => url.includes(d))) {
      return NextResponse.json(
        { ok: false, error: "Importing from YouTube, Instagram, TikTok, or Facebook is not supported. Use Twitch or Kick links." },
        { status: 400 }
      );
    }

    const { data: uploads } = await supabaseAdmin
      .from("uploads")
      .select("file_size")
      .eq("team_id", teamId)
      .eq("storage_deleted", false);
    const usedBytes = uploads?.reduce((s, r) => s + (r.file_size || 0), 0) ?? 0;
    const limitBytes = team.plan === "team" ? 15 * 1024 ** 3 : 5 * 1024 ** 3;
    if (usedBytes > limitBytes * 0.85) {
      return NextResponse.json(
        { ok: false, error: "Storage nearly full. Delete old uploads before importing." },
        { status: 403 }
      );
    }

    const sourcePlatform = detectPlatform(url);

    // ── Kick: resolve CDN URL via kick-proxy, build Vercel-proxied direct_url ──
    // GitHub Actions datacenter IPs are blocked by Kick's Cloudflare CDN; Vercel IPs are not.
    // For direct MP4: route through kick-video-proxy (simple pass-through).
    // For HLS m3u8: route through kick-m3u8-proxy which rewrites each segment URL
    //   to go through kick-video-proxy, so ffmpeg fetches every segment via Vercel.
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
        const t = setTimeout(() => abort.abort(), 10000);
        const r = await fetch(
          `${siteUrl}/api/kick-proxy?token=${encodeURIComponent(workerSecret)}&clipId=${encodeURIComponent(clipId)}&url=${encodeURIComponent(url)}`,
          { signal: abort.signal }
        );
        clearTimeout(t);
        const d = await r.json() as any;
        if (d.ok && d.clip_url) {
          const cdnUrl: string = d.clip_url;
          const isHLS = cdnUrl.toLowerCase().includes(".m3u8");
          if (isHLS) {
            // HLS stream: kick-m3u8-proxy rewrites segment URLs to go through Vercel
            kickDirectUrl = `${siteUrl}/api/kick-m3u8-proxy?token=${encodeURIComponent(workerSecret)}&url=${encodeURIComponent(cdnUrl)}`;
          } else {
            // Direct MP4: simple proxy through Vercel
            kickDirectUrl = `${siteUrl}/api/kick-video-proxy?token=${encodeURIComponent(workerSecret)}&url=${encodeURIComponent(cdnUrl)}`;
          }
          kickTitle = d.title ?? null;
          kickDuration = typeof d.duration === "number" ? d.duration : null;
        }
      } catch (e) {
        console.error("[kick-proxy] failed:", e);
      }
      if (!kickDirectUrl) {
        return NextResponse.json(
          { ok: false, error: "Could not fetch Kick clip info — the clip may be private, deleted, or Kick's API is temporarily down." },
          { status: 502 }
        );
      }
    }

    // Create import job row
    const { data: job, error: jobErr } = await supabaseAdmin
      .from("import_jobs")
      .insert({
        team_id: teamId,
        user_id: userId,
        url,
        source_platform: sourcePlatform,
        status: "pending",
        ...(kickTitle ? { title: kickTitle } : {}),
        ...(kickDuration != null ? { duration_seconds: kickDuration } : {}),
      })
      .select("id")
      .single();

    if (jobErr || !job) {
      return NextResponse.json({ ok: false, error: "Failed to create import job." }, { status: 500 });
    }

    // Dispatch GitHub Actions workflow
    if (!GITHUB_PAT) {
      console.warn("GITHUB_PAT not set — workflow not dispatched");
    } else {
      await dispatchGitHubActions({
        job_id: job.id,
        url,
        team_id: teamId,
        user_id: userId,
        ...(kickDirectUrl ? { direct_url: kickDirectUrl } : {}),
        ...(kickTitle ? { prefetched_title: kickTitle } : {}),
        ...(kickDuration != null ? { prefetched_duration: String(kickDuration) } : {}),
      });
    }

    return NextResponse.json({ ok: true, jobId: job.id, platform: sourcePlatform });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}

// ─── GET /api/imports ─────────────────────────────────────────────────────────

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
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
