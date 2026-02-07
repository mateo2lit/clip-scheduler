import { NextResponse } from "next/server";
import { google } from "googleapis";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

/**
 * Server-safe site URL resolution:
 * - Prefer explicit server env if present
 * - Otherwise rely on the actual request origin (best on Vercel)
 */
function getSiteUrl(req: Request) {
  return (
    process.env.SITE_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    new URL(req.url).origin
  );
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    const code = url.searchParams.get("code");
    const userId = url.searchParams.get("state"); // ✅ comes from start route

    if (!code) {
      return NextResponse.json({ ok: false, error: "Missing code" }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ ok: false, error: "Missing state (user id)" }, { status: 400 });
    }

    const clientId = mustEnv("GOOGLE_CLIENT_ID");
    const clientSecret = mustEnv("GOOGLE_CLIENT_SECRET");

    const siteUrl = getSiteUrl(req);
    const redirectUri = `${siteUrl}/api/auth/youtube/callback`;

    const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    // ✅ Exchange code for tokens
    const { tokens } = await oauth2.getToken(code);

    const accessToken = tokens.access_token ?? null;

    // IMPORTANT:
    // Google may NOT return refresh_token on subsequent connects.
    // We must preserve the existing refresh_token in DB if it exists.
    const newRefreshToken = tokens.refresh_token ?? null;

    // Optional but useful for debugging/worker logic
    const expiryIso =
      typeof tokens.expiry_date === "number" ? new Date(tokens.expiry_date).toISOString() : null;

    // 1) Read existing platform account (if any) so we can preserve refresh_token
    const existing = await supabaseAdmin
      .from("platform_accounts")
      .select("id, refresh_token")
      .eq("user_id", userId)
      .eq("provider", "youtube")
      .maybeSingle();

    if (existing.error) {
      return NextResponse.json({ ok: false, error: existing.error.message }, { status: 500 });
    }

    const preservedRefreshToken = existing.data?.refresh_token ?? null;
    const refreshTokenToStore = newRefreshToken || preservedRefreshToken;

    // If we have NO refresh token at all, tell the user how to fix it.
    // This usually means they need to revoke access in Google and reconnect.
    if (!refreshTokenToStore) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No refresh_token available. Please revoke Clip Scheduler access in your Google Account security settings and reconnect.",
        },
        { status: 400 }
      );
    }

    // 2) Upsert platform_accounts safely
    const { error: upsertErr } = await supabaseAdmin.from("platform_accounts").upsert(
      {
        user_id: userId,
        provider: "youtube",
        access_token: accessToken, // access tokens rotate, safe to update
        refresh_token: refreshTokenToStore, // preserve if Google didn't return one
        expiry: expiryIso, // store expiry if your table has this column
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" }
    );

    if (upsertErr) {
      // If your platform_accounts table does NOT have `expiry`, Supabase will error.
      // In that case, remove the `expiry` field above and retry.
      return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 });
    }

    return NextResponse.redirect(`${siteUrl}/settings?connected=youtube`);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
