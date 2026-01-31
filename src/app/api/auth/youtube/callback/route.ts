import { NextResponse } from "next/server";
import { google } from "googleapis";
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

export async function GET(req: Request) {
  const url = new URL(req.url);

  const code = url.searchParams.get("code");
  const userId = url.searchParams.get("state"); // ✅ comes from start route

  if (!code) {
    return NextResponse.json({ ok: false, error: "Missing code" }, { status: 400 });
  }

  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "Missing state (user id)" },
      { status: 400 }
    );
  }

  const clientId = mustEnv("GOOGLE_CLIENT_ID");
  const clientSecret = mustEnv("GOOGLE_CLIENT_SECRET");

  const siteUrl = getSiteUrl(req);
  const redirectUri = `${siteUrl}/api/auth/youtube/callback`;

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  // ✅ Exchange code for tokens
  const { tokens } = await oauth2.getToken(code);

  const accessToken = tokens.access_token ?? null;
  const refreshToken = tokens.refresh_token ?? null;

  if (!refreshToken) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "No refresh_token returned. Revoke Clip Scheduler access in Google Security and reconnect.",
      },
      { status: 400 }
    );
  }

  // ✅ Save into platform_accounts
  const { error: upsertErr } = await supabaseAdmin.from("platform_accounts").upsert(
    {
      user_id: userId,
      provider: "youtube",
      access_token: accessToken,
      refresh_token: refreshToken,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" }
  );

  if (upsertErr) {
    return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.redirect(`${siteUrl}/settings?connected=youtube`);
}
