import { NextResponse } from "next/server";
import { getPinterestAuthConfig } from "@/lib/pinterest";
import { getTeamContext, requireOwnerOrAdmin } from "@/lib/teamAuth";
import { generateOAuthState } from "@/lib/oauthState";

export const runtime = "nodejs";

async function handler(req: Request) {
  const result = await getTeamContext(req);
  if (!result.ok) return result.error;

  const { userId, role } = result.ctx;
  const ownerCheck = requireOwnerOrAdmin(role);
  if (ownerCheck) return ownerCheck;

  const { clientId, redirectUri } = getPinterestAuthConfig();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    // boards:write is required to create a pin — Pinterest treats adding a pin as
    // writing to the board, not just writing a pin, and rejects pin creation with
    // 401 "Missing: ['boards:write']" without it. Users who connected before this
    // scope was added must reconnect to grant it.
    scope: "boards:read,boards:write,pins:read,pins:write,user_accounts:read",
    state: generateOAuthState(userId),
  });

  const authUrl = `https://www.pinterest.com/oauth/?${params.toString()}`;
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
