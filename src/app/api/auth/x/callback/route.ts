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

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    if (errorParam) {
      const errorDesc = url.searchParams.get("error_description") || errorParam;
      return NextResponse.json(
        { ok: false, error: `X auth denied: ${errorDesc}` },
        { status: 400 }
      );
    }

    if (!code) {
      return NextResponse.json({ ok: false, error: "Missing code" }, { status: 400 });
    }

    if (!state) {
      return NextResponse.json({ ok: false, error: "Missing state" }, { status: 400 });
    }

    // State format: "signedToken:codeVerifier"
    const lastColon = state.lastIndexOf(":");
    if (lastColon === -1) {
      return NextResponse.json({ ok: false, error: "Invalid state" }, { status: 400 });
    }
    const signedToken = state.slice(0, lastColon);
    const codeVerifier = state.slice(lastColon + 1);
    if (!signedToken || !codeVerifier) {
      return NextResponse.json({ ok: false, error: "Invalid state" }, { status: 400 });
    }
    const userId = verifyOAuthState(signedToken);

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

    const ownerCheckResult = requireOwnerOrAdmin(membership.role);
    if (ownerCheckResult) return ownerCheckResult;

    const teamId = membership.team_id;

    const { clientId, clientSecret, redirectUri } = getXAuthConfig();

    // X requires Basic auth on the token endpoint
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    // Exchange code for tokens
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

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return NextResponse.json(
        { ok: false, error: `X token exchange failed: ${tokenRes.status} ${text}` },
        { status: 500 }
      );
    }

    const tokens = await tokenRes.json();

    if (tokens.error) {
      return NextResponse.json(
        { ok: false, error: `X error: ${tokens.error} - ${tokens.error_description}` },
        { status: 400 }
      );
    }

    const accessToken = tokens.access_token;
    const refreshToken = tokens.refresh_token;
    const expiresIn = tokens.expires_in;

    if (!accessToken || !refreshToken) {
      return NextResponse.json(
        { ok: false, error: "X did not return tokens" },
        { status: 400 }
      );
    }

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Fetch X user profile info
    let profileName: string | null = null;
    let avatarUrl: string | null = null;
    let platformUserId: string | null = null;

    try {
      const profileRes = await fetch(
        "https://api.twitter.com/2/users/me?user.fields=profile_image_url",
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
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

    if (!platformUserId) {
      return NextResponse.json(
        { ok: false, error: "Failed to retrieve X user ID" },
        { status: 400 }
      );
    }

    // Upsert platform_accounts
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

    if (upsertErr) {
      return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 });
    }

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
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
