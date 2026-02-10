import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getFacebookAuthConfig,
  exchangeForLongLivedToken,
  getFacebookUserPages,
} from "@/lib/facebook";
import { requireOwner } from "@/lib/teamAuth";

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
        { ok: false, error: `Facebook auth denied: ${errorDesc}` },
        { status: 400 }
      );
    }

    if (!code) {
      return NextResponse.json({ ok: false, error: "Missing code" }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ ok: false, error: "Missing state (user id)" }, { status: 400 });
    }

    // Look up team membership and verify owner role
    const { data: membership } = await supabaseAdmin
      .from("team_members")
      .select("team_id, role")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ ok: false, error: "No team found for user" }, { status: 403 });
    }

    const ownerCheckResult = requireOwner(membership.role);
    if (ownerCheckResult) return ownerCheckResult;

    const teamId = membership.team_id;

    const { appId, appSecret, redirectUri } = getFacebookAuthConfig();

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
        { ok: false, error: `Facebook token exchange failed: ${tokenRes.status} ${text}` },
        { status: 500 }
      );
    }

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return NextResponse.json(
        { ok: false, error: `Facebook error: ${tokenData.error.message}` },
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

    // 3) Fetch user's Pages
    const pages = await getFacebookUserPages(longLivedToken);

    if (pages.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No Facebook Pages found. You need a Facebook Page to post videos." },
        { status: 400 }
      );
    }

    // Auto-select first page
    const page = pages[0];

    // 4) Fetch page profile picture
    let profileName: string | null = page.name || null;
    let avatarUrl: string | null = null;
    try {
      const picRes = await fetch(
        `https://graph.facebook.com/v21.0/${page.id}/picture?redirect=false&access_token=${encodeURIComponent(page.access_token)}`
      );
      if (picRes.ok) {
        const picData = await picRes.json();
        avatarUrl = picData?.data?.url || null;
      }
    } catch {
      // Non-fatal
    }

    // 5) Upsert platform_accounts with provider="facebook"
    const { error: upsertErr } = await supabaseAdmin.from("platform_accounts").upsert(
      {
        user_id: userId,
        team_id: teamId,
        provider: "facebook",
        access_token: longLivedToken,
        refresh_token: longLivedToken,
        expiry: expiresAt,
        platform_user_id: page.id,
        page_id: page.id,
        page_access_token: page.access_token,
        profile_name: profileName,
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "team_id,provider" }
    );

    if (upsertErr) {
      return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 });
    }

    const siteUrl = getSiteUrl(req);
    return NextResponse.redirect(`${siteUrl}/settings?connected=facebook`);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
