import { NextResponse } from "next/server";
import { google } from "googleapis";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function getSiteUrl(req: Request) {
  return process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
}

function getSupabaseAccessTokenFromCookies(): string | null {
  const store = cookies();

  // Common cookie
  const direct = store.get("sb-access-token")?.value;
  if (direct) return direct;

  // Fallback cookie
  const all = store.getAll();
  const authCookie = all.find((c) => c.name.endsWith("-auth-token"))?.value;
  if (!authCookie) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(authCookie));
    return parsed?.access_token ?? null;
  } catch {
    return null;
  }
}

async function handler(req: Request) {
  const clientId = mustEnv("GOOGLE_CLIENT_ID");
  const clientSecret = mustEnv("GOOGLE_CLIENT_SECRET");

  const siteUrl = getSiteUrl(req);
  const redirectUri = `${siteUrl}/api/auth/youtube/callback`;

  // ✅ Must be signed in
  const accessToken = getSupabaseAccessTokenFromCookies();
  if (!accessToken) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data?.user) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  const userId = data.user.id;

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  // ✅ CRITICAL: state = userId so callback can save refresh_token correctly
  const authUrl = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/youtube.upload"],
    response_type: "code",
    state: userId,
  });

  return NextResponse.redirect(authUrl);
}

export async function GET(req: Request) {
  return handler(req);
}

export async function POST(req: Request) {
  return handler(req);
}
