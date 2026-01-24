// src/app/api/auth/youtube/start/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";
import { google } from "googleapis";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function hmac(input: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(input).digest("hex");
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7)
      : "";

    if (!token) return jsonError("Missing Authorization token", 401);

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) return jsonError("Invalid session", 401);

    const userId = userData.user.id;

    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const redirectUri = `${siteUrl}/api/auth/youtube/callback`;
    const stateSecret = process.env.OAUTH_STATE_SECRET!;

    if (!clientId || !clientSecret) return jsonError("Missing GOOGLE_CLIENT_ID/SECRET", 500);
    if (!stateSecret) return jsonError("Missing OAUTH_STATE_SECRET", 500);

    const ts = Date.now().toString();
    const payload = `${userId}.${ts}`;
    const sig = hmac(payload, stateSecret);
    const state = `${payload}.${sig}`;

    const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    const url = oauth2.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [
        "https://www.googleapis.com/auth/youtube.upload",
        "https://www.googleapis.com/auth/youtube.readonly",
      ],
      state,
    });

    return NextResponse.json({ ok: true, url });
  } catch (e: any) {
    console.error("POST /api/auth/youtube/start failed:", e?.message ?? e);
    return jsonError(e?.message ?? "Failed to start YouTube OAuth", 500);
  }
}
