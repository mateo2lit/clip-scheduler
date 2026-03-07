import { NextResponse } from "next/server";
import { getTeamContext, requireOwnerOrAdmin } from "@/lib/teamAuth";
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

async function handler(req: Request) {
  const result = await getTeamContext(req);
  if (!result.ok) return result.error;

  const { userId, teamId, role } = result.ctx;
  const ownerCheck = requireOwnerOrAdmin(role);
  if (ownerCheck) return ownerCheck;

  const { apiKey, apiSecret } = getXConsumerKeys();
  const siteUrl = getSiteUrl(req);
  const callbackUrl = `${siteUrl}/api/auth/x/callback`;

  // Step 1: get a request token from Twitter
  const authHeader = buildOAuth1Header("POST", "https://api.twitter.com/oauth/request_token", apiKey, apiSecret, {
    oauthCallback: callbackUrl,
  });

  const res = await fetch("https://api.twitter.com/oauth/request_token", {
    method: "POST",
    headers: { Authorization: authHeader },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`X request token failed: ${res.status} ${text}`);
  }

  const body = await res.text();
  const params = new URLSearchParams(body);
  const oauthToken = params.get("oauth_token");
  const oauthTokenSecret = params.get("oauth_token_secret");

  if (!oauthToken || !oauthTokenSecret) {
    throw new Error("X did not return a request token");
  }

  // Store the token secret + user context in an httpOnly cookie for the callback
  const response = NextResponse.json({
    ok: true,
    url: `https://api.twitter.com/oauth/authorize?oauth_token=${oauthToken}`,
  });

  response.cookies.set(
    "x_oauth1_state",
    JSON.stringify({ oauthTokenSecret, userId, teamId }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 15 * 60, // 15 minutes
      path: "/",
      sameSite: "lax",
    }
  );

  return response;
}

export async function POST(req: Request) {
  try {
    return await handler(req);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    return await handler(req);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
