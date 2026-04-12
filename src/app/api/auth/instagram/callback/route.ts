import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getInstagramAuthConfig,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getInstagramProfile,
} from "@/lib/instagram";
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
      .order("joined_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!membership) return redirectError(req, "no_team");

    const ownerCheckResult = requireOwnerOrAdmin(membership.role);
    if (ownerCheckResult) return ownerCheckResult;

    const teamId = membership.team_id;
    const { redirectUri } = getInstagramAuthConfig();

    const shortLived = await exchangeCodeForToken(code, redirectUri);
    const longLived = await exchangeForLongLivedToken(shortLived.access_token);
    const longLivedToken = longLived.access_token;
    const expiresAt = new Date(Date.now() + longLived.expires_in * 1000).toISOString();

    const profile = await getInstagramProfile(longLivedToken);
    const igUserId = profile.id;
    const profileName = profile.username || null;
    const avatarUrl = profile.profilePictureUrl || null;

    const { error: upsertErr } = await supabaseAdmin.from("platform_accounts").upsert(
      {
        user_id: userId,
        team_id: teamId,
        provider: "instagram",
        access_token: longLivedToken,
        refresh_token: longLivedToken,
        expiry: expiresAt,
        platform_user_id: igUserId,
        ig_user_id: igUserId,
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
    const response = NextResponse.redirect(`${siteUrl}${redirectPath}?connected=instagram`);
    if (inOnboarding) {
      response.cookies.set("clip-onboarding", "", { maxAge: 0, path: "/" });
    }
    return response;
  } catch (e: any) {
    const msg = e?.message || "";
    if (msg.includes("expired")) return redirectError(req, "expired");
    if (msg.includes("OAuth state")) return redirectError(req, "invalid");
    if (msg.includes("Instagram token") || msg.includes("Instagram profile")) return redirectError(req, "token_exchange");
    return redirectError(req, "unknown");
  }
}
