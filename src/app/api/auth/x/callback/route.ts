import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getXAuthConfig } from "@/lib/x";
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

    // State format: "signedToken:codeVerifier"
    const lastColon = state.lastIndexOf(":");
    if (lastColon === -1) return redirectError(req, "invalid");
    const signedToken = state.slice(0, lastColon);
    const codeVerifier = state.slice(lastColon + 1);
    if (!signedToken || !codeVerifier) return redirectError(req, "invalid");

    const userId = verifyOAuthState(signedToken);

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

    const { clientId, clientSecret, redirectUri } = getXAuthConfig();

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const tokenRes = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenRes.ok) return redirectError(req, "token_exchange");

    const tokens = await tokenRes.json();
    if (tokens.error) return redirectError(req, "token_exchange");

    const accessToken = tokens.access_token;
    const refreshToken = tokens.refresh_token;
    const expiresIn = tokens.expires_in;

    if (!accessToken || !refreshToken) return redirectError(req, "token_exchange");

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Fetch X user profile info
    let profileName: string | null = null;
    let avatarUrl: string | null = null;
    let platformUserId: string | null = null;

    try {
      const profileRes = await fetch(
        "https://api.twitter.com/2/users/me?user.fields=profile_image_url",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        const user = profileData?.data;
        if (user) {
          platformUserId = user.id ?? null;
          profileName = user.name ?? user.username ?? null;
          avatarUrl = user.profile_image_url ?? null;
        }
      }
    } catch (profileErr) {
      console.warn("Failed to fetch X user info:", profileErr);
    }

    if (!platformUserId) return redirectError(req, "token_exchange");

    const { error: upsertErr } = await supabaseAdmin.from("platform_accounts").upsert(
      {
        user_id: userId,
        team_id: teamId,
        provider: "x",
        access_token: accessToken,
        refresh_token: refreshToken,
        platform_user_id: platformUserId,
        expiry: expiresAt,
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
    const response = NextResponse.redirect(`${siteUrl}${redirectPath}?connected=x`);
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
