import { NextResponse } from "next/server";
import { google } from "googleapis";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function getSiteUrlFromRequest(req: Request): string {
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

  const normalizedHost = host.startsWith("http") ? host : `${proto}://${host}`;
  return normalizedHost.replace(/\/$/, "");
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  if (errorParam) {
    return NextResponse.json({ ok: false, error: errorParam }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({ ok: false, error: "Missing code" }, { status: 400 });
  }

  if (!state) {
    return NextResponse.json({ ok: false, error: "Missing state (user id)" }, { status: 400 });
  }

  const clientId = mustEnv("GOOGLE_CLIENT_ID");
  const clientSecret = mustEnv("GOOGLE_CLIENT_SECRET");

  const siteUrl = getSiteUrlFromRequest(req);
  const redirectUri = `${siteUrl}/api/auth/youtube/callback`;

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const { tokens } = await oauth2.getToken(code);

  const accessToken = tokens.access_token ?? null;
  const refreshTokenFromGoogle = tokens.refresh_token ?? null;
  const expiryIso =
    typeof tokens.expiry_date === "number" ? new Date(tokens.expiry_date).toISOString() : null;

  const { data: existing } = await supabaseAdmin
    .from("platform_accounts")
    .select("id, refresh_token")
    .eq("user_id", state)
    .eq("provider", "youtube")
    .maybeSingle();

  const finalRefreshToken = refreshTokenFromGoogle ?? existing?.refresh_token ?? null;

  const { error: upsertErr } = await supabaseAdmin.from("platform_accounts").upsert(
    {
      user_id: state,
      provider: "youtube",
      access_token: accessToken,
      refresh_token: finalRefreshToken,
      expiry: expiryIso,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" }
  );

  if (upsertErr) {
    return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 });
  }

  if (!finalRefreshToken) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Connected but refresh_token was not returned. Revoke Clip Scheduler in Google Account security settings, then reconnect.",
      },
      { status: 400 }
    );
  }

  return NextResponse.redirect(`${siteUrl}/settings?connected=youtube`);
}
