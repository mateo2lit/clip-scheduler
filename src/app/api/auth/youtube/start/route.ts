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

function getSupabaseAccessTokenFromCookies(): string | null {
  const store = cookies();

  // 1) Common cookie name
  const direct = store.get("sb-access-token")?.value;
  if (direct) return direct;

  // 2) Some setups store JSON in sb-<project-ref>-auth-token
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

export async function GET() {
  const clientId = mustEnv("GOOGLE_CLIENT_ID");
  const clientSecret = mustEnv("GOOGLE_CLIENT_SECRET");
  const siteUrl = mustEnv("NEXT_PUBLIC_SITE_URL");

  const redirectUri = `${siteUrl}/api/auth/youtube/callback`;

  // ✅ Identify signed-in user via Supabase session cookie
  const accessToken = getSupabaseAccessTokenFromCookies();
  if (!accessToken) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data?.user) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  // ✅ CRITICAL: forces refresh_token
  const googleUrl = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    response_type: "code",
    scope: [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
    ],
    state: data.user.id,
  });

  return NextResponse.redirect(googleUrl);
}
