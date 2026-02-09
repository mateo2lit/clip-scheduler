import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getInstagramAuthConfig,
  exchangeForLongLivedToken,
  getInstagramAccounts,
} from "@/lib/instagram";

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
    const userId = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    if (errorParam) {
      const errorDesc = url.searchParams.get("error_description") || errorParam;
      return NextResponse.json(
        { ok: false, error: `Instagram auth denied: ${errorDesc}` },
        { status: 400 }
      );
    }

    if (!code) {
      return NextResponse.json({ ok: false, error: "Missing code" }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ ok: false, error: "Missing state (user id)" }, { status: 400 });
    }

    const { appId, appSecret, redirectUri } = getInstagramAuthConfig();

    // 1) Exchange code for short-lived token
    const tokenParams = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    });

    const tokenRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?${tokenParams.toString()}`
    );

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return NextResponse.json(
        { ok: false, error: `Instagram token exchange failed: ${tokenRes.status} ${text}` },
        { status: 500 }
      );
    }

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return NextResponse.json(
        { ok: false, error: `Instagram error: ${tokenData.error.message}` },
        { status: 400 }
      );
    }

    const shortToken = tokenData.access_token;
    if (!shortToken) {
      return NextResponse.json(
        { ok: false, error: "Facebook did not return an access token" },
        { status: 400 }
      );
    }

    // 2) Exchange for long-lived token (~60 days)
    const longLived = await exchangeForLongLivedToken(shortToken);
    const longLivedToken = longLived.access_token;
    const expiresAt = new Date(Date.now() + longLived.expires_in * 1000).toISOString();

    // 3) Fetch Instagram Business accounts linked to Pages
    const igAccounts = await getInstagramAccounts(longLivedToken);

    if (igAccounts.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No Instagram Business account found. Make sure your Instagram account is linked to a Facebook Page as a Business or Creator account.",
        },
        { status: 400 }
      );
    }

    // Auto-select first IG account
    const ig = igAccounts[0];

    // 4) Fetch IG profile info (username, profile picture)
    let profileName: string | null = null;
    let avatarUrl: string | null = null;
    try {
      const profileRes = await fetch(
        `https://graph.facebook.com/v21.0/${ig.igUserId}?fields=username,profile_picture_url&access_token=${encodeURIComponent(ig.pageAccessToken)}`
      );
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        profileName = profileData.username || ig.pageName || null;
        avatarUrl = profileData.profile_picture_url || null;
      }
    } catch {
      // Non-fatal
      profileName = ig.pageName || null;
    }

    // 5) Upsert platform_accounts with provider="instagram"
    const { error: upsertErr } = await supabaseAdmin.from("platform_accounts").upsert(
      {
        user_id: userId,
        provider: "instagram",
        access_token: longLivedToken,
        refresh_token: longLivedToken,
        expiry: expiresAt,
        platform_user_id: ig.igUserId,
        ig_user_id: ig.igUserId,
        page_id: ig.pageId,
        page_access_token: ig.pageAccessToken,
        profile_name: profileName,
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" }
    );

    if (upsertErr) {
      return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 });
    }

    const siteUrl = getSiteUrl(req);
    return NextResponse.redirect(`${siteUrl}/settings?connected=instagram`);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
