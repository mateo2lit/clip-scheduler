import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

// Streams a video from Supabase Storage so TikTok can fetch it via PULL_FROM_URL.
// The URL passed to TikTok is: https://clipdash.org/api/tiktok-video-proxy?path=...&token=TIKTOK_PROXY_SECRET
// clipdash.org is a verified domain in the TikTok developer portal.

export async function GET(req: NextRequest) {
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

  // Stream the file from Supabase — body is piped directly to TikTok,
  // never buffered in memory.
  const fileRes = await fetch(data.signedUrl);

  if (!fileRes.ok || !fileRes.body) {
    return new Response("Failed to fetch video from storage", { status: 502 });
  }

  const headers: Record<string, string> = {
    "Content-Type": fileRes.headers.get("content-type") || "video/mp4",
    "Accept-Ranges": "bytes",
  };

  const contentLength = fileRes.headers.get("content-length");
  if (contentLength) headers["Content-Length"] = contentLength;

  return new Response(fileRes.body, { status: 200, headers });
}
