import { NextResponse } from "next/server";
import { getThreadsAuthConfig } from "@/lib/threads";
import { getTeamContext, requireOwnerOrAdmin } from "@/lib/teamAuth";
import { generateOAuthState } from "@/lib/oauthState";

export const runtime = "nodejs";

async function handler(req: Request) {
  const result = await getTeamContext(req);
  if (!result.ok) return result.error;

  const { userId, role } = result.ctx;
  const ownerCheck = requireOwnerOrAdmin(role);
  if (ownerCheck) return ownerCheck;

  const { appId, redirectUri } = getThreadsAuthConfig();

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "threads_basic,threads_content_publish",
    state: generateOAuthState(userId),
  });

  const authUrl = `https://threads.net/oauth/authorize?${params.toString()}`;
  return NextResponse.json({ ok: true, url: authUrl, redirectUri });
}

export async function POST(req: Request) {
  try {
    return await handler(req);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    return await handler(req);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
