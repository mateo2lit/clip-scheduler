import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTikTokAuthConfig } from "@/lib/tiktok";
import { getTeamContext, requireOwner } from "@/lib/teamAuth";
import crypto from "node:crypto";

export const runtime = "nodejs";

function readBearer(req: Request) {
  const h = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] || null;
}

function generateCodeVerifier(): string {
  // 43-128 character random string using unreserved characters
  return crypto.randomBytes(32).toString("base64url");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const hash = crypto.createHash("sha256").update(verifier).digest();
  return hash.toString("base64url");
}

async function handler(req: Request) {
  const result = await getTeamContext(req);
  if (!result.ok) return result.error;

  const { userId, role } = result.ctx;
  const ownerCheck = requireOwner(role);
  if (ownerCheck) return ownerCheck;

  const { clientKey, redirectUri } = getTikTokAuthConfig();

  // Generate PKCE code_verifier and code_challenge
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // Encode userId and code_verifier in state so callback can use both
  const state = `${userId}:${codeVerifier}`;

  const params = new URLSearchParams({
    client_key: clientKey,
    response_type: "code",
    scope: "user.info.basic,video.upload,video.publish",
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const authUrl = `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;

  return NextResponse.json({ ok: true, url: authUrl, redirectUri });
}

export async function POST(req: Request) {
  try {
    return await handler(req);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    return await handler(req);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
