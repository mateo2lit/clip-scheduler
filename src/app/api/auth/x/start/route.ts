import { NextResponse } from "next/server";
import { getXAuthConfig } from "@/lib/xUpload";
import { getTeamContext, requireOwnerOrAdmin } from "@/lib/teamAuth";
import { generateOAuthState } from "@/lib/oauthState";
import crypto from "crypto";

export const runtime = "nodejs";

async function handler(req: Request) {
  const result = await getTeamContext(req);
  if (!result.ok) return result.error;

  const { userId, role } = result.ctx;
  const ownerCheck = requireOwnerOrAdmin(role);
  if (ownerCheck) return ownerCheck;

  const { clientId, redirectUri } = getXAuthConfig();

  // PKCE — code verifier is random, challenge is SHA-256(verifier) base64url
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  // State embeds signed userId token + codeVerifier separated by ":"
  const signedToken = generateOAuthState(userId);
  const state = `${signedToken}:${codeVerifier}`;

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "tweet.write users.read offline.access openid",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const authUrl = `https://x.com/i/oauth2/authorize?${params.toString()}`;

  return NextResponse.json({ ok: true, url: authUrl });
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
