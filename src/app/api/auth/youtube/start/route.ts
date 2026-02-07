import { NextResponse } from "next/server";
import { google } from "googleapis";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

/**
 * Server-safe site URL resolution:
 * - Prefer explicit server env if present
 * - Otherwise rely on the actual request origin (best on Vercel)
 */
function getSiteUrl(req: Request) {
  return (
    process.env.SITE_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    new URL(req.url).origin
  );
}

function readBearer(req: Request) {
  const h = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] || null;
}

async function handler(req: Request) {
  const token = readBearer(req);
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "Missing Authorization Bearer token" },
      { status: 401 }
    );
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  const user = data?.user;

  if (error || !user) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  const siteUrl = getSiteUrl(req);
  const redirectUri = `${siteUrl}/api/auth/youtube/callback`;

  const oauth2 = new google.auth.OAuth2(
    mustEnv("GOOGLE_CLIENT_ID"),
    mustEnv("GOOGLE_CLIENT_SECRET"),
    redirectUri
  );

  // ✅ IMPORTANT:
  // - access_type=offline + prompt=consent requests a refresh token
  // - include_granted_scopes helps when users already granted some scopes previously
  // - state=user.id so callback can upsert platform_accounts correctly
  const authUrl = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: [
      "https://www.googleapis.com/auth/youtube.upload",
      // Optional but reduces edge-case permission weirdness in some accounts:
      "https://www.googleapis.com/auth/youtube",
    ],
    state: user.id,
  });

  // ✅ Return JSON because your Settings page expects it
  return NextResponse.json({ ok: true, url: authUrl, redirectUri });
}

export async function POST(req: Request) {
  try {
    return await handler(req);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  // Optional: allow GET too (handy for manual testing)
  try {
    return await handler(req);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
