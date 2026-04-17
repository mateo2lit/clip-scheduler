import { NextResponse } from "next/server";
import { getTeamContext, requireOwnerOrAdmin } from "@/lib/teamAuth";
import { generateOAuthState } from "@/lib/oauthState";

export const runtime = "nodejs";

function getSnapchatConfig() {
  const clientId = process.env.SNAPCHAT_CLIENT_ID;
  const siteUrl =
    process.env.SITE_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_SITE_URL;
  if (!clientId || !siteUrl) throw new Error("Missing SNAPCHAT_CLIENT_ID / NEXT_PUBLIC_SITE_URL env vars");
  return { clientId, redirectUri: `${siteUrl}/api/auth/snapchat/callback` };
}

async function handler(req: Request) {
  const result = await getTeamContext(req);
  if (!result.ok) return result.error;

  const { userId, role } = result.ctx;
  const ownerCheck = requireOwnerOrAdmin(role);
  if (ownerCheck) return ownerCheck;

  const { clientId, redirectUri } = getSnapchatConfig();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "snapchat-marketing-api",
    state: generateOAuthState(userId),
  });

  const authUrl = `https://accounts.snapchat.com/login/oauth2/authorize?${params.toString()}`;
  return NextResponse.json({ ok: true, url: authUrl });
}

export async function GET(req: Request) {
  try { return await handler(req); }
  catch (e: any) { return NextResponse.json({ ok: false, error: e?.message }, { status: 500 }); }
}

export async function POST(req: Request) {
  try { return await handler(req); }
  catch (e: any) { return NextResponse.json({ ok: false, error: e?.message }, { status: 500 }); }
}
