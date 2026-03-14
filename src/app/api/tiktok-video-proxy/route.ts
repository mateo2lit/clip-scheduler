import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

// Streams a video from Supabase Storage so TikTok can fetch it via PULL_FROM_URL.
// The URL passed to TikTok is: https://clipdash.org/api/tiktok-video-proxy?path=...&token=TIKTOK_PROXY_SECRET
// clipdash.org is a verified domain in the TikTok developer portal.

async function proxyToSupabase(req: NextRequest, method: "GET" | "HEAD") {
  const { searchParams } = req.nextUrl;
  const token = searchParams.get("token");
  const path = searchParams.get("path");
  const bucket = searchParams.get("bucket") || "clips";

  if (!process.env.TIKTOK_PROXY_SECRET || token !== process.env.TIKTOK_PROXY_SECRET) {
    return new Response("Unauthorized", { status: 403 });
  }

  if (!path) {
    return new Response("Missing path", { status: 400 });
  }

  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 30); // 30 min

  if (error || !data?.signedUrl) {
    return new Response("Failed to generate signed URL", { status: 500 });
  }

  const range = req.headers.get("range");
  const upstreamHeaders: HeadersInit = {};
  if (range) upstreamHeaders.Range = range;

  // Stream the file from Supabase — body is piped directly to TikTok,
  // never buffered in memory.
  const fileRes = await fetch(data.signedUrl, {
    method,
    headers: upstreamHeaders,
  });

  if (!fileRes.ok) {
    return new Response("Failed to fetch video from storage", { status: 502 });
  }

  const headers = new Headers();
  headers.set("Content-Type", fileRes.headers.get("content-type") || "video/mp4");
  headers.set("Accept-Ranges", fileRes.headers.get("accept-ranges") || "bytes");
  const contentLength = fileRes.headers.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);
  const contentRange = fileRes.headers.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);

  if (method === "HEAD") {
    return new Response(null, { status: fileRes.status, headers });
  }
  if (!fileRes.body) {
    return new Response("Missing upstream body", { status: 502 });
  }

  return new Response(fileRes.body, { status: fileRes.status, headers });
}

export async function GET(req: NextRequest) {
  return proxyToSupabase(req, "GET");
}

export async function HEAD(req: NextRequest) {
  return proxyToSupabase(req, "HEAD");
}
