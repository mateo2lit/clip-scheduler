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

function getSiteUrlFromRequest(req: Request): string {
  // Prefer explicit env if you have it
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host =
    req.headers.get("x-forwarded-host") ||
    req.headers.get("host") ||
    process.env.VERCEL_URL;

  if (!host) {
    throw new Error("Unable to determine site URL (missing host)");
  }

  // VERCEL_URL is usually like "clip-scheduler.vercel.app" (no scheme)
  const normalizedHost = host.startsWith("http") ? host : `${proto}://${host}`;
  return normalizedHost.replace(/\/$/, "");
}

function getSupabaseAccessTokenFromCookies(): string | null {
  const store = cookies();

  const direct = store.get("sb-access-token")?.value;
  if (direct) return direct;

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

export async function GET(req: Request) {
  const clientId = mustEnv("GOOGLE_CLIENT_ID");
  const clientSecret = mustEnv("GOOGLE_CLIENT_SECRET");

  const siteUrl = getSiteUrlFromRequest(req);
  const redirectUri = `${siteUrl}/api/auth/youtube/callback`;

  const accessToken = getSupabaseAccessTokenFromCookies();
  if (!accessToken) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data?.user) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

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
