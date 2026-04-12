import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getFacebookAuthConfig,
  exchangeForLongLivedToken,
  getFacebookUserPages,
} from "@/lib/facebook";
import { requireOwnerOrAdmin } from "@/lib/teamAuth";
import { verifyOAuthState } from "@/lib/oauthState";
import { cookies } from "next/headers";

export const runtime = "nodejs";

function getSiteUrl(req: Request) {
  return (
    process.env.SITE_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    new URL(req.url).origin
  );
}

function redirectError(req: Request, code: string): NextResponse {
  return NextResponse.redirect(`${getSiteUrl(req)}/settings?error=${code}`);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    if (errorParam) return redirectError(req, "auth_denied");
    if (!code) return redirectError(req, "invalid");
    if (!state) return redirectError(req, "invalid");

    const userId = verifyOAuthState(state);

    const { data: membership } = await supabaseAdmin
      .from("team_members")
      .select("team_id, role")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (!membership) return redirectError(req, "no_team");

    const ownerCheckResult = requireOwnerOrAdmin(membership.role);
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

    if (!tokenRes.ok) return redirectError(req, "token_exchange");

    const tokenData = await tokenRes.json();
    if (tokenData.error) return redirectError(req, "token_exchange");

    const shortToken = tokenData.access_token;
    if (!shortToken) return redirectError(req, "token_exchange");

    // 2) Exchange for long-lived token (~60 days)
    const longLived = await exchangeForLongLivedToken(shortToken);
    const longLivedToken = longLived.access_token;
    const expiresIn = longLived.expires_in || 5184000;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // 3) Fetch user's Pages
    const pages = await getFacebookUserPages(longLivedToken);

    if (pages.length === 0) return redirectError(req, "no_pages");

    // Auto-select first page
    const page = pages[0];

    const profileName: string | null = page.name || null;
    const avatarUrl = `https://graph.facebook.com/${page.id}/picture?type=large`;

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
        label: profileName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "team_id,provider,platform_user_id" }
    );

    if (upsertErr) return redirectError(req, "save_failed");

    const siteUrl = getSiteUrl(req);
    const cookieStore = cookies();
    const inOnboarding = cookieStore.get("clip-onboarding")?.value === "1";
    const redirectPath = inOnboarding ? "/onboarding" : "/settings";
    const response = NextResponse.redirect(`${siteUrl}${redirectPath}?connected=facebook`);
    if (inOnboarding) {
      response.cookies.set("clip-onboarding", "", { maxAge: 0, path: "/" });
    }
    return response;
  } catch (e: any) {
    const msg = e?.message || "";
    if (msg.includes("expired")) return redirectError(req, "expired");
    if (msg.includes("OAuth state")) return redirectError(req, "invalid");
    return redirectError(req, "unknown");
  }
}
