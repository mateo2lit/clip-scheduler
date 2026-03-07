import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireOwnerOrAdmin } from "@/lib/teamAuth";
import { buildOAuth1Header, getXConsumerKeys } from "@/lib/xOAuth1";

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
  const siteUrl = getSiteUrl(req);

  try {
    const url = new URL(req.url);
    const oauthToken = url.searchParams.get("oauth_token");
    const oauthVerifier = url.searchParams.get("oauth_verifier");
    const denied = url.searchParams.get("denied");

    if (denied) {
      return NextResponse.redirect(`${siteUrl}/settings?error=x_denied`);
    }

    if (!oauthToken || !oauthVerifier) {
      return NextResponse.json({ ok: false, error: "Missing oauth_token or oauth_verifier" }, { status: 400 });
    }

    // Read the state cookie set during /start
    const cookieHeader = req.headers.get("cookie") ?? "";
    const cookieMatch = cookieHeader.match(/x_oauth1_state=([^;]+)/);
    if (!cookieMatch) {
      return NextResponse.json({ ok: false, error: "Missing OAuth state cookie — please try connecting again" }, { status: 400 });
    }

    let oauthTokenSecret: string, userId: string, teamId: string;
    try {
      ({ oauthTokenSecret, userId, teamId } = JSON.parse(decodeURIComponent(cookieMatch[1])));
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid OAuth state cookie" }, { status: 400 });
    }

    const { data: membership } = await supabaseAdmin
      .from("team_members")
      .select("role")
      .eq("user_id", userId)
      .eq("team_id", teamId)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ ok: false, error: "No team found for user" }, { status: 403 });
    }

    const ownerCheck = requireOwnerOrAdmin(membership.role);
    if (ownerCheck) return ownerCheck;

    const { apiKey, apiSecret } = getXConsumerKeys();

    // Step 3: exchange request token + verifier for access token
    const authHeader = buildOAuth1Header(
      "POST",
      "https://api.twitter.com/oauth/access_token",
      apiKey,
      apiSecret,
      {
        accessToken: oauthToken,       // the REQUEST token
        accessTokenSecret: oauthTokenSecret, // the REQUEST token secret
        oauthVerifier,
      }
    );

    const tokenRes = await fetch("https://api.twitter.com/oauth/access_token", {
      method: "POST",
      headers: { Authorization: authHeader },
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return NextResponse.json(
        { ok: false, error: `X access token exchange failed: ${tokenRes.status} ${text}` },
        { status: 500 }
      );
    }

    const tokenBody = await tokenRes.text();
    const tokenParams = new URLSearchParams(tokenBody);

    const accessToken = tokenParams.get("oauth_token");
    const accessTokenSecret = tokenParams.get("oauth_token_secret");
    const platformUserId = tokenParams.get("user_id");
    const screenName = tokenParams.get("screen_name");

    if (!accessToken || !accessTokenSecret) {
      return NextResponse.json({ ok: false, error: "X did not return access tokens" }, { status: 400 });
    }

    // Store OAuth 1.0a tokens:
    //   access_token  = OAuth 1.0a access token
    //   refresh_token = OAuth 1.0a access token secret (no refresh in 1.0a — repurposed column)
    //   expiry        = null (OAuth 1.0a tokens don't expire)
    const accountData = {
      user_id: userId,
      team_id: teamId,
      provider: "x",
      access_token: accessToken,
      refresh_token: accessTokenSecret,
      expiry: null,
      platform_user_id: platformUserId,
      profile_name: screenName ? `@${screenName}` : null,
      avatar_url: null,
      label: screenName ? `@${screenName}` : null,
      updated_at: new Date().toISOString(),
    };

    // Manual upsert (avoids needing a DB constraint)
    const { data: existing } = await supabaseAdmin
      .from("platform_accounts")
      .select("id")
      .eq("team_id", teamId)
      .eq("provider", "x")
      .maybeSingle();

    let upsertErr: any = null;
    if (existing?.id) {
      const { error } = await supabaseAdmin
        .from("platform_accounts")
        .update(accountData)
        .eq("id", existing.id);
      upsertErr = error;
    } else {
      const { error } = await supabaseAdmin.from("platform_accounts").insert(accountData);
      upsertErr = error;
    }

    if (upsertErr) {
      return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 });
    }

    // Clear the state cookie and redirect
    const response = NextResponse.redirect(`${siteUrl}/settings?connected=x`);
    response.cookies.set("x_oauth1_state", "", { maxAge: 0, path: "/" });
    return response;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
