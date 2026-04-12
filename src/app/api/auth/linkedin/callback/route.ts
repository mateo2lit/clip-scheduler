import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getLinkedInAuthConfig,
  exchangeCodeForToken,
  getLinkedInProfile,
} from "@/lib/linkedin";
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

    const { redirectUri } = getLinkedInAuthConfig();

    const tokenData = await exchangeCodeForToken(code, redirectUri);
    const accessToken = tokenData.access_token;
    const expiresIn = tokenData.expires_in || 5184000;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    const profile = await getLinkedInProfile(accessToken);

    const { error: upsertErr } = await supabaseAdmin.from("platform_accounts").upsert(
      {
        user_id: userId,
        team_id: teamId,
        provider: "linkedin",
        access_token: accessToken,
        refresh_token: accessToken,
        expiry: expiresAt,
        platform_user_id: profile.sub,
        profile_name: profile.name,
        avatar_url: profile.picture,
        label: profile.name,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "team_id,provider,platform_user_id" }
    );

    if (upsertErr) return redirectError(req, "save_failed");

    const siteUrl = getSiteUrl(req);
    const cookieStore = cookies();
    const inOnboarding = cookieStore.get("clip-onboarding")?.value === "1";
    const redirectPath = inOnboarding ? "/onboarding" : "/settings";
    const response = NextResponse.redirect(`${siteUrl}${redirectPath}?connected=linkedin`);
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
