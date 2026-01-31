import { NextResponse } from "next/server";
import { google } from "googleapis";

export const runtime = "nodejs";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function getRedirectUri(req: Request) {
  // Prefer env, but fall back to request origin (works even if env missing/misconfigured)
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;

  return `${siteUrl}/api/auth/youtube/callback`;
}

function buildAuthUrl(req: Request) {
  const clientId = mustEnv("GOOGLE_CLIENT_ID");
  const clientSecret = mustEnv("GOOGLE_CLIENT_SECRET");
  const redirectUri = getRedirectUri(req);

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  // Offline + consent => refresh_token
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/userinfo.email",
      "openid",
      "profile",
    ],
    include_granted_scopes: true,
  });
}

// ✅ Support GET
export async function GET(req: Request) {
  try {
    const url = buildAuthUrl(req);
    return NextResponse.redirect(url);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}

// ✅ Support POST too (fixes your 405)
export async function POST(req: Request) {
  return GET(req);
}
