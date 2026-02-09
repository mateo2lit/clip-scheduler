import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getInstagramAuthConfig } from "@/lib/instagram";

export const runtime = "nodejs";

function readBearer(req: Request) {
  const h = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] || null;
}

async function handler(req: Request) {
  const token = readBearer(req);
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "Missing Authorization Bearer token" },
      { status: 401 }
    );
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  const user = data?.user;

  if (error || !user) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  const { appId, redirectUri } = getInstagramAuthConfig();

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement",
    state: user.id,
  });

  const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;

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
