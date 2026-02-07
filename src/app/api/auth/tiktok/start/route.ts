import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTikTokAuthConfig } from "@/lib/tiktok";

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

  const { clientKey, redirectUri } = getTikTokAuthConfig();

  // Generate a random CSRF token and encode state as userId
  const csrfState = crypto.randomUUID();
  const state = `${user.id}:${csrfState}`;

  const params = new URLSearchParams({
    client_key: clientKey,
    response_type: "code",
    scope: "user.info.basic,video.upload,video.publish",
    redirect_uri: redirectUri,
    state,
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
