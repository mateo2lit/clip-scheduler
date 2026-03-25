import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

// Streams a Kick CDN video URL through Vercel so GitHub Actions can download it.
// GitHub Actions datacenter IPs are blocked by Kick's Cloudflare CDN; Vercel IPs are not.

async function proxyKick(req: NextRequest, method: "GET" | "HEAD") {
  const { searchParams } = req.nextUrl;
  const token = searchParams.get("token");
  const url = searchParams.get("url");

  if (!process.env.WORKER_SECRET || token !== process.env.WORKER_SECRET) {
    return new Response("Unauthorized", { status: 403 });
  }

  if (!url) {
    return new Response("Missing url", { status: 400 });
  }

  let targetUrl: string;
  try {
    // searchParams.get() already URL-decodes the value — don't double-decode
    new URL(url); // validate
    targetUrl = url;
  } catch {
    return new Response("Invalid url", { status: 400 });
  }

  const upstreamHeaders: HeadersInit = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Referer": "https://kick.com/",
    "Origin": "https://kick.com",
  };

  const range = req.headers.get("range");
  if (range) (upstreamHeaders as Record<string, string>)["Range"] = range;

  const res = await fetch(targetUrl, { method, headers: upstreamHeaders });

  if (!res.ok && res.status !== 206) {
    return new Response(`Kick CDN returned ${res.status}`, { status: 502 });
  }

  const headers = new Headers();
  headers.set("Content-Type", res.headers.get("content-type") || "video/mp4");
  headers.set("Accept-Ranges", "bytes");
  const contentLength = res.headers.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);
  const contentRange = res.headers.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);

  if (method === "HEAD") {
    return new Response(null, { status: res.status, headers });
  }

  if (!res.body) {
    return new Response("No body from Kick CDN", { status: 502 });
  }

  return new Response(res.body, { status: res.status, headers });
}

export async function GET(req: NextRequest) {
  return proxyKick(req, "GET");
}

export async function HEAD(req: NextRequest) {
  return proxyKick(req, "HEAD");
}
