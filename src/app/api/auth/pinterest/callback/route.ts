import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getPinterestAuthConfig, exchangePinterestCode, getPinterestUser } from "@/lib/pinterest";
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

function redirectError(req: Request, code: string) {
  return NextResponse.redirect(`${getSiteUrl(req)}/settings?error=${code}`);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    if (errorParam) return redirectError(req, "auth_denied");
    if (!code || !state) return redirectError(req, "invalid");

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
    const { redirectUri } = getPinterestAuthConfig();

    const tokenData = await exchangePinterestCode(code, redirectUri);
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    const user = await getPinterestUser(tokenData.access_token);

    const { error: upsertErr } = await supabaseAdmin.from("platform_accounts").upsert(
      {
        user_id: userId,
        team_id: teamId,
        provider: "pinterest",
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expiry: expiresAt,
        platform_user_id: user.username,
        profile_name: user.username,
        avatar_url: user.profile_image,
        label: user.username,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "team_id,provider,platform_user_id" }
    );

    if (upsertErr) return redirectError(req, "save_failed");

    const siteUrl = getSiteUrl(req);
    const cookieStore = cookies();
    const inOnboarding = cookieStore.get("clip-onboarding")?.value === "1";
    const redirectPath = inOnboarding ? "/onboarding" : "/settings";
    const response = NextResponse.redirect(`${siteUrl}${redirectPath}?connected=pinterest`);
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
