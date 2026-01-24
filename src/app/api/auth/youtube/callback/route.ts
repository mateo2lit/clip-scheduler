// src/app/api/auth/youtube/callback/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";
import { google } from "googleapis";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function hmac(input: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(input).digest("hex");
}

function safeRedirect(extra: string) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  // send user back to settings page with status
  return NextResponse.redirect(`${siteUrl}/settings${extra}`);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code") || "";
    const state = searchParams.get("state") || "";
    const error = searchParams.get("error") || "";

    if (error) return safeRedirect(`?youtube=error&reason=${encodeURIComponent(error)}`);
    if (!code || !state) return safeRedirect(`?youtube=error&reason=missing_code_or_state`);

    const stateSecret = process.env.OAUTH_STATE_SECRET!;
    if (!stateSecret) return safeRedirect(`?youtube=error&reason=missing_state_secret`);

    // state format: userId.ts.sig
    const parts = state.split(".");
    if (parts.length !== 3) return safeRedirect(`?youtube=error&reason=bad_state_format`);

    const [userId, ts, sig] = parts;
    const payload = `${userId}.${ts}`;
    const expected = hmac(payload, stateSecret);

    // constant-time compare
    if (
      sig.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    ) {
      return safeRedirect(`?youtube=error&reason=bad_state_signature`);
    }

    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const redirectUri = `${siteUrl}/api/auth/youtube/callback`;

    if (!clientId || !clientSecret) {
      return safeRedirect(`?youtube=error&reason=missing_google_oauth_env`);
    }

    const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    const { tokens } = await oauth2.getToken(code);

    const expiry =
      typeof tokens.expiry_date === "number" ? new Date(tokens.expiry_date).toISOString() : null;

    const row = {
      user_id: userId,
      provider: "youtube",
      access_token: tokens.access_token ?? null,
      refresh_token: tokens.refresh_token ?? null, // may only appear first time
      expiry,
      scope: tokens.scope ?? null,
      token_type: tokens.token_type ?? null,
      updated_at: new Date().toISOString(),
    };

    const { error: upErr } = await supabaseAdmin
      .from("platform_accounts")
      .upsert(row, { onConflict: "user_id,provider" });

    if (upErr) {
      return safeRedirect(`?youtube=error&reason=${encodeURIComponent(upErr.message)}`);
    }

    return safeRedirect(`?youtube=connected`);
  } catch (e: any) {
    console.error("GET /api/auth/youtube/callback failed:", e?.message ?? e);
    return safeRedirect(`?youtube=error&reason=${encodeURIComponent(e?.message ?? "callback_failed")}`);
  }
}
