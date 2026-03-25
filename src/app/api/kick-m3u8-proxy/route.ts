import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

// Fetches a Kick HLS m3u8 playlist from the CDN (Vercel IPs are not blocked) and
// rewrites every segment URL to go through /api/kick-video-proxy. This allows
// GitHub Actions (whose datacenter IPs ARE blocked by Kick's CDN) to download
// every .ts segment through Vercel without any direct Kick CDN access.

const KICK_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Referer": "https://kick.com/",
  "Origin": "https://kick.com",
};

function resolveUrl(base: string, relative: string): string {
  if (/^https?:\/\//i.test(relative)) return relative;
  const u = new URL(base);
  if (relative.startsWith("/")) return `${u.protocol}//${u.host}${relative}`;
  const dir = u.pathname.substring(0, u.pathname.lastIndexOf("/") + 1);
  return `${u.protocol}//${u.host}${dir}${relative}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const token = searchParams.get("token");
  const url = searchParams.get("url");

  if (!process.env.WORKER_SECRET || token !== process.env.WORKER_SECRET) {
    return new Response("Unauthorized", { status: 403 });
  }
  if (!url) return new Response("Missing url", { status: 400 });

  let targetUrl: string;
  try {
    new URL(url);
    targetUrl = url;
  } catch {
    return new Response("Invalid url", { status: 400 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://clipdash.org";
  const workerSecret = process.env.WORKER_SECRET!;

  try {
    let res = await fetch(targetUrl, { headers: KICK_HEADERS });
    if (!res.ok) return new Response(`CDN returned ${res.status}`, { status: 502 });
    let text = await res.text();
    let mediaUrl = targetUrl;

    // Follow master playlist → best quality media playlist
    if (text.includes("#EXT-X-STREAM-INF")) {
      const lines = text.split("\n");
      let bestBw = -1, bestUrl = "";
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith("#EXT-X-STREAM-INF")) {
          const bw = parseInt(line.match(/BANDWIDTH=(\d+)/i)?.[1] ?? "0");
          const next = lines[i + 1]?.trim();
          if (next && !next.startsWith("#") && bw > bestBw) {
            bestBw = bw;
            bestUrl = resolveUrl(targetUrl, next);
          }
        }
      }
      if (!bestUrl) return new Response("No streams in master playlist", { status: 502 });
      mediaUrl = bestUrl;
      res = await fetch(mediaUrl, { headers: KICK_HEADERS });
      if (!res.ok) return new Response(`CDN returned ${res.status} for media playlist`, { status: 502 });
      text = await res.text();
    }

    // Rewrite every segment URL to go through kick-video-proxy
    const rewritten = text
      .split("\n")
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return line;
        const segUrl = resolveUrl(mediaUrl, trimmed);
        return `${siteUrl}/api/kick-video-proxy?token=${encodeURIComponent(workerSecret)}&url=${encodeURIComponent(segUrl)}`;
      })
      .join("\n");

    return new Response(rewritten, {
      status: 200,
      headers: { "Content-Type": "application/vnd.apple.mpegurl" },
    });
  } catch (e: any) {
    return new Response(`Error: ${e?.message ?? "Unknown error"}`, { status: 502 });
  }
}
