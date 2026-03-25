import { NextResponse } from "next/server";
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function patchJob(jobId: string, fields: Record<string, unknown>) {
  await supabaseAdmin
    .from("import_jobs")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", jobId);
}

const KICK_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Referer": "https://kick.com/",
  "Origin": "https://kick.com",
};

function resolveHLSUrl(base: string, relative: string): string {
  if (/^https?:\/\//i.test(relative)) return relative;
  const u = new URL(base);
  if (relative.startsWith("/")) return `${u.protocol}//${u.host}${relative}`;
  const dir = u.pathname.substring(0, u.pathname.lastIndexOf("/") + 1);
  return `${u.protocol}//${u.host}${dir}${relative}`;
}

async function fetchKick(url: string): Promise<Response> {
  const res = await fetch(url, { headers: KICK_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res;
}

// Downloads an HLS stream by fetching every .ts segment and concatenating them.
// Returns raw MPEG-TS bytes. Vercel IPs can reach Kick CDN; GitHub Actions IPs cannot.
async function downloadHLSToBuffer(m3u8Url: string): Promise<Buffer> {
  let text = await (await fetchKick(m3u8Url)).text();
  let mediaUrl = m3u8Url;

  // Follow master playlist → media playlist if needed
  if (text.includes("#EXT-X-STREAM-INF")) {
    const lines = text.split("\n");
    let bestBw = -1;
    let bestUrl = "";
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith("#EXT-X-STREAM-INF")) {
        const bw = parseInt(line.match(/BANDWIDTH=(\d+)/i)?.[1] ?? "0");
        const next = lines[i + 1]?.trim();
        if (next && !next.startsWith("#") && bw > bestBw) {
          bestBw = bw;
          bestUrl = resolveHLSUrl(m3u8Url, next);
        }
      }
    }
    if (!bestUrl) throw new Error("No streams found in HLS master playlist.");
    mediaUrl = bestUrl;
    text = await (await fetchKick(bestUrl)).text();
  }

  // Parse segment URLs from media playlist
  const segmentUrls = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => resolveHLSUrl(mediaUrl, l));

  if (segmentUrls.length === 0) throw new Error("No segments found in HLS playlist.");
  if (segmentUrls.length > 600) throw new Error("Clip is too long (too many HLS segments).");

  // Download segments sequentially and concatenate
  const chunks: Buffer[] = [];
  let totalSize = 0;
  for (const seg of segmentUrls) {
    const buf = Buffer.from(await (await fetchKick(seg)).arrayBuffer());
    totalSize += buf.length;
    if (totalSize > 2 * 1024 ** 3) throw new Error("Clip exceeds the 2 GB file size limit.");
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

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

// ─── Kick processor ───────────────────────────────────────────────────────────
// Architecture:
//   Phase 1 (Vercel, this function): Download from Kick CDN — Vercel's Cloudflare
//     IPs are not blocked. For HLS, concatenate all segments into raw MPEG-TS bytes.
//     Upload raw bytes to Supabase as a temp file.
//   Phase 2 (GitHub Actions, only for HLS): Download temp file from Supabase
//     (GitHub Actions IPs can reach Supabase). Remux .ts → .mp4 with ffmpeg.
//   For direct MP4: skip Phase 2, mark done immediately.

async function processKickInVercel({
  jobId, cdnUrl, teamId, userId, title, durationSeconds,
}: {
  jobId: string; cdnUrl: string; teamId: string; userId: string;
  title: string | null; durationSeconds: number | null;
}) {
  try {
    await patchJob(jobId, { status: "fetching" });

    const isHLS = cdnUrl.toLowerCase().includes(".m3u8");
    let fileBuffer: Buffer;

    if (isHLS) {
      // Download and concatenate all HLS segments in Vercel
      fileBuffer = await downloadHLSToBuffer(cdnUrl);
    } else {
      // Direct MP4 — stream to buffer
      const res = await fetchKick(cdnUrl);
      const cl = res.headers.get("content-length");
      if (cl && parseInt(cl, 10) > 2 * 1024 ** 3) {
        throw new Error("Clip exceeds the 2 GB file size limit.");
      }
      fileBuffer = Buffer.from(await res.arrayBuffer());
      if (fileBuffer.length > 2 * 1024 ** 3) {
        throw new Error("Clip exceeds the 2 GB file size limit.");
      }
    }

    await patchJob(jobId, {
      status: "uploading",
      ...(title ? { title } : {}),
      ...(durationSeconds != null ? { duration_seconds: durationSeconds } : {}),
    });

    // Upload raw bytes to Supabase Storage
    const storagePath = isHLS
      ? `${teamId}/${jobId}_raw.ts`  // temp; GitHub Actions will remux and replace
      : `${teamId}/${jobId}.mp4`;

    const uploadRes = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/clips/${storagePath}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": isHLS ? "video/mp2t" : "video/mp4",
          "Content-Length": String(fileBuffer.length),
        },
        body: new Uint8Array(fileBuffer),
      }
    );
    if (!uploadRes.ok) {
      const err = await uploadRes.text().catch(() => "");
      throw new Error(`Storage upload failed (${uploadRes.status}): ${err.slice(0, 200)}`);
    }

    if (!isHLS) {
      // Direct MP4: done — create uploads row immediately
      const uploadId = crypto.randomUUID();
      await supabaseAdmin.from("uploads").insert({
        id: uploadId,
        user_id: userId,
        team_id: teamId,
        bucket: "clips",
        file_path: storagePath,
        file_size: fileBuffer.length,
        storage_deleted: false,
      });
      await patchJob(jobId, { status: "done", upload_id: uploadId });
    } else {
      // HLS raw .ts uploaded — dispatch GitHub Actions ONLY for the ffmpeg remux step.
      // GitHub Actions downloads from Supabase (no Kick CDN access needed).
      await dispatchGitHubActions({
        job_id: jobId,
        url: "",           // not needed; raw_ts_path takes precedence
        team_id: teamId,
        user_id: userId,
        raw_ts_path: storagePath,
        ...(title ? { prefetched_title: title } : {}),
        ...(durationSeconds != null ? { prefetched_duration: String(durationSeconds) } : {}),
      });
      // Job stays "uploading"; GitHub Actions marks it done after remux
    }
  } catch (err: any) {
    const msg = err?.message ?? "Kick import failed unexpectedly.";
    console.error(`[kick-import] job ${jobId}:`, msg);
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
    const usedBytes = uploads?.reduce((s, r) => s + (r.file_size || 0), 0) ?? 0;
    const limitBytes = team.plan === "team" ? 15 * 1024 ** 3 : 5 * 1024 ** 3;
    if (usedBytes > limitBytes * 0.85) {
      return NextResponse.json(
        { ok: false, error: "Storage nearly full. Delete old uploads before importing." },
        { status: 403 }
      );
    }

    const sourcePlatform = detectPlatform(url);

    // ── Kick: resolve CDN URL from kick-proxy ──────────────────────────────────
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
        const t = setTimeout(() => abort.abort(), 10000);
        const r = await fetch(
          `${siteUrl}/api/kick-proxy?token=${encodeURIComponent(workerSecret)}&clipId=${encodeURIComponent(clipId)}&url=${encodeURIComponent(url)}`,
          { signal: abort.signal }
        );
        clearTimeout(t);
        const d = await r.json() as any;
        if (d.ok && d.clip_url) {
          kickCdnUrl = d.clip_url;
          kickTitle = d.title ?? null;
          kickDuration = typeof d.duration === "number" ? d.duration : null;
        }
      } catch (e) {
        console.error("[kick-proxy] failed:", e);
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
      // Kick: download in Vercel (Cloudflare IPs not blocked by Kick CDN)
      // This is synchronous — the POST takes ~20–120s depending on clip size.
      // The modal shows a spinner during this time, then polling sees the result.
      await processKickInVercel({
        jobId: job.id,
        cdnUrl: kickCdnUrl,
        teamId,
        userId,
        title: kickTitle,
        durationSeconds: kickDuration,
      });
    } else {
      // Non-Kick: dispatch to GitHub Actions as before
      if (!GITHUB_PAT) {
        console.warn("GITHUB_PAT not set — workflow not dispatched");
      } else {
        await dispatchGitHubActions({
          job_id: job.id,
          url,
          team_id: teamId,
          user_id: userId,
        });
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
