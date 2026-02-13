import { NextResponse } from "next/server";
import { getInstagramAuthConfig } from "@/lib/instagram";
import { getTeamContext, requireOwner } from "@/lib/teamAuth";

export const runtime = "nodejs";

async function handler(req: Request) {
  const result = await getTeamContext(req);
  if (!result.ok) return result.error;

  const { userId, role } = result.ctx;
  const ownerCheck = requireOwner(role);
  if (ownerCheck) return ownerCheck;

  const { appId, redirectUri } = getInstagramAuthConfig();

  const reqUrl = new URL(req.url);
  const force = reqUrl.searchParams.get("force") === "1";

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "instagram_business_basic,instagram_business_content_publish",
    state: userId,
  });

  if (force) {
    params.set("force_authentication", "1");
  }

  const authUrl = `https://www.instagram.com/oauth/authorize?${params.toString()}`;

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
