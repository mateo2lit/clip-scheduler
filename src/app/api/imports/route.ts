import { NextResponse } from "next/server";
import { unstable_after as after } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";
export const maxDuration = 300;

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

// ─── Kick-in-Vercel processor ────────────────────────────────────────────────
// Kick CDN is Cloudflare-protected. GitHub Actions datacenter IPs get blocked.
// Vercel runs on Cloudflare IPs, so we download + upload entirely within Vercel.

async function patchJob(jobId: string, fields: Record<string, unknown>) {
  await supabaseAdmin.from("import_jobs").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", jobId);
}

async function processKickInVercel({
  jobId, cdnUrl, teamId, userId, title, durationSeconds,
}: {
  jobId: string; cdnUrl: string; teamId: string; userId: string;
  title: string | null; durationSeconds: number | null;
}) {
  try {
    await patchJob(jobId, { status: "fetching" });

    // Fetch from Kick CDN with browser-like headers (Vercel IPs are not blocked)
    const kickRes = await fetch(cdnUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Referer": "https://kick.com/",
        "Origin": "https://kick.com",
      },
    });

    if (!kickRes.ok) {
      throw new Error(`Kick CDN returned HTTP ${kickRes.status}. The clip may be private, deleted, or expired.`);
    }

    const contentType = kickRes.headers.get("content-type") ?? "";
    if (contentType.includes("mpegurl") || cdnUrl.includes(".m3u8")) {
      throw new Error("This Kick clip is an HLS stream, which requires re-encoding. Direct MP4 clips only for now.");
    }

    const contentLength = kickRes.headers.get("content-length");
    const fileSize = contentLength ? parseInt(contentLength, 10) : 0;
    if (fileSize > 2 * 1024 ** 3) {
      throw new Error("Clip exceeds the 2 GB file size limit.");
    }

    if (!kickRes.body) {
      throw new Error("Kick CDN returned an empty response body.");
    }

    await patchJob(jobId, {
      status: "uploading",
      ...(title ? { title } : {}),
      ...(durationSeconds != null ? { duration_seconds: durationSeconds } : {}),
    });

    // Stream directly from Kick CDN → Supabase Storage (no memory buffering)
    const filePath = `${teamId}/${jobId}.mp4`;
    const uploadRes = await fetch(
      `${process.env.SUPABASE_URL}/storage/v1/object/clips/${filePath}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "video/mp4",
          ...(contentLength ? { "Content-Length": contentLength } : {}),
        },
        body: kickRes.body,
        // @ts-ignore — required for streaming request body in Node.js fetch
        duplex: "half",
      }
    );

    if (!uploadRes.ok) {
      const errText = await uploadRes.text().catch(() => "");
      throw new Error(`Storage upload failed (${uploadRes.status}): ${errText.slice(0, 200)}`);
    }

    // Create uploads row
    const uploadId = crypto.randomUUID();
    const { error: uploadRowErr } = await supabaseAdmin.from("uploads").insert({
      id: uploadId,
      user_id: userId,
      team_id: teamId,
      bucket: "clips",
      file_path: filePath,
      file_size: fileSize,
      storage_deleted: false,
    });

    if (uploadRowErr) {
      throw new Error(`Failed to record upload: ${uploadRowErr.message}`);
    }

    await patchJob(jobId, { status: "done", upload_id: uploadId });
  } catch (err: any) {
    const msg = err?.message || "Kick import failed unexpectedly.";
    console.error(`[kick-import] job ${jobId} failed:`, msg);
    await patchJob(jobId, { status: "failed", error: msg });
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

    const usedBytes = uploads?.reduce((sum, r) => sum + (r.file_size || 0), 0) ?? 0;
    const limitBytes = team.plan === "team" ? 15 * 1024 ** 3 : 5 * 1024 ** 3;
    if (usedBytes > limitBytes * 0.85) {
      return NextResponse.json(
        { ok: false, error: "Storage nearly full. Delete old uploads before importing." },
        { status: 403 }
      );
    }

    const sourcePlatform = detectPlatform(url);

    // ── Kick: resolve CDN URL via kick-proxy (Vercel IPs allowed by Kick) ──
    let kickCdnUrl: string | null = null;
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
        const timeout = setTimeout(() => abort.abort(), 10000);
        const proxyRes = await fetch(
          `${siteUrl}/api/kick-proxy?token=${encodeURIComponent(workerSecret)}&clipId=${encodeURIComponent(clipId)}&url=${encodeURIComponent(url)}`,
          { signal: abort.signal }
        );
        clearTimeout(timeout);
        const d = await proxyRes.json() as any;
        if (d.ok && d.clip_url) {
          kickCdnUrl = d.clip_url; // raw CDN URL — used directly in Vercel (no proxy needed)
          kickTitle = d.title ?? null;
          kickDuration = typeof d.duration === "number" ? d.duration : null;
        }
      } catch (e) {
        console.error("[kick-proxy] fetch failed:", e);
      }

      if (!kickCdnUrl) {
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

    if (sourcePlatform === "kick" && kickCdnUrl) {
      // ── Process Kick entirely inside Vercel after the response is sent ──
      // No GitHub Actions needed — Vercel IPs are not blocked by Kick's CDN.
      const capturedCdnUrl = kickCdnUrl;
      const capturedTitle = kickTitle;
      const capturedDuration = kickDuration;
      after(async () => {
        await processKickInVercel({
          jobId: job.id,
          cdnUrl: capturedCdnUrl,
          teamId,
          userId,
          title: capturedTitle,
          durationSeconds: capturedDuration,
        });
      });
    } else {
      // ── Non-Kick platforms: dispatch to GitHub Actions ──
      if (!GITHUB_PAT) {
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
