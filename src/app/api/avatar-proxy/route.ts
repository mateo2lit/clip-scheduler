import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Allowed CDN hostnames for platform avatars — prevents open proxy abuse
const ALLOWED_HOSTS = [
  "lh3.googleusercontent.com",      // Google / YouTube
  "p16-sign-sg.tiktokcdn.com",      // TikTok
  "p16-sign-va.tiktokcdn.com",
  "p19-sign-sg.tiktokcdn.com",
  "p19-sign-va.tiktokcdn.com",
  "p16-amd-va.tiktokcdn.com",
  "p77-sign-sg.tiktokcdn.com",
  "p9-sign-sg.tiktokcdn.com",
  "p26-sign-sg.tiktokcdn.com",
  "cdninstagram.com",               // Instagram (suffix match below)
  "fbcdn.net",                      // Facebook (suffix match below)
  "media.licdn.com",                // LinkedIn
  "media-exp1.licdn.com",
  "cdn.bsky.app",                   // Bluesky
  "av-eks-egress.bsky.app",
];

function isAllowed(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return ALLOWED_HOSTS.some((allowed) =>
    host === allowed || host.endsWith(`.${allowed}`)
  );
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("url");

  if (!raw) {
    return new NextResponse("Missing url param", { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new NextResponse("Invalid url", { status: 400 });
  }

  if (!["https:", "http:"].includes(target.protocol) || !isAllowed(target)) {
    return new NextResponse("URL not allowed", { status: 403 });
  }

  try {
    const upstream = await fetch(target.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ClipDash/1.0)",
        Accept: "image/*",
      },
    });

    if (!upstream.ok) {
      return new NextResponse("Upstream error", { status: 502 });
    }

    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return new NextResponse("Not an image", { status: 422 });
    }

    const body = await upstream.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return new NextResponse("Fetch failed", { status: 502 });
  }
}
