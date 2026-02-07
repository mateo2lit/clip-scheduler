import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTikTokAuthConfig } from "@/lib/tiktok";

export const runtime = "nodejs";

function getSiteUrl(req: Request) {
  return (
    process.env.SITE_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    new URL(req.url).origin
  );
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    if (errorParam) {
      const errorDesc = url.searchParams.get("error_description") || errorParam;
      return NextResponse.json(
        { ok: false, error: `TikTok auth denied: ${errorDesc}` },
        { status: 400 }
      );
    }

    if (!code) {
      return NextResponse.json({ ok: false, error: "Missing code" }, { status: 400 });
    }

    if (!state) {
      return NextResponse.json({ ok: false, error: "Missing state" }, { status: 400 });
    }

    // State format: "userId:codeVerifier"
    const [userId, codeVerifier] = state.split(":");
    if (!userId || !codeVerifier) {
      return NextResponse.json({ ok: false, error: "Invalid state" }, { status: 400 });
    }

    const { clientKey, clientSecret, redirectUri } = getTikTokAuthConfig();

    // Exchange code for tokens via TikTok API (with PKCE code_verifier)
    const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return NextResponse.json(
        { ok: false, error: `TikTok token exchange failed: ${tokenRes.status} ${text}` },
        { status: 500 }
      );
    }

    const tokens = await tokenRes.json();

    if (tokens.error) {
      return NextResponse.json(
        { ok: false, error: `TikTok error: ${tokens.error} - ${tokens.error_description}` },
        { status: 400 }
      );
    }

    const accessToken = tokens.access_token;
    const refreshToken = tokens.refresh_token;
    const openId = tokens.open_id;
    const expiresIn = tokens.expires_in;

    if (!accessToken || !refreshToken) {
      return NextResponse.json(
        { ok: false, error: "TikTok did not return tokens" },
        { status: 400 }
      );
    }

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Preserve existing refresh_token if TikTok doesn't return a new one
    const existing = await supabaseAdmin
      .from("platform_accounts")
      .select("id, refresh_token")
      .eq("user_id", userId)
      .eq("provider", "tiktok")
      .maybeSingle();

    if (existing.error) {
      return NextResponse.json({ ok: false, error: existing.error.message }, { status: 500 });
    }

    const refreshTokenToStore = refreshToken || existing.data?.refresh_token;

    if (!refreshTokenToStore) {
      return NextResponse.json(
        { ok: false, error: "No refresh_token available from TikTok." },
        { status: 400 }
      );
    }

    // Upsert platform_accounts
    const { error: upsertErr } = await supabaseAdmin.from("platform_accounts").upsert(
      {
        user_id: userId,
        provider: "tiktok",
        access_token: accessToken,
        refresh_token: refreshTokenToStore,
        platform_user_id: openId || null,
        expiry: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" }
    );

    if (upsertErr) {
      return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 });
    }

    const siteUrl = getSiteUrl(req);
    return NextResponse.redirect(`${siteUrl}/settings?connected=tiktok`);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
