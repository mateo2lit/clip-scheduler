import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTikTokAccessToken } from "@/lib/tiktok";

export const runtime = "nodejs";

const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; ClipDash/1.0)",
  Accept: "image/*",
};

async function proxyImage(url: string): Promise<NextResponse | null> {
  try {
    const res = await fetch(url, { headers: FETCH_HEADERS });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "image/jpeg";
    if (!ct.startsWith("image/")) return null;
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": ct,
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch {
    return null;
  }
}

// No auth required — account UUIDs are unguessable (128-bit random).
// This endpoint fetches fresh avatars using stored credentials server-side,
// so IP-signed CDN URLs are fetched immediately on the same server that requested them.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) return new NextResponse("Missing id", { status: 400 });

  const { data: account } = await supabaseAdmin
    .from("platform_accounts")
    .select("provider, access_token, refresh_token, expiry, avatar_url, page_id, ig_user_id, platform_user_id")
    .eq("id", id)
    .maybeSingle();

  if (!account) return new NextResponse("Not found", { status: 404 });

  const { provider, avatar_url, page_id, ig_user_id } = account;
  let { access_token } = account;

  try {
    // Facebook: stable public picture URL — no signed tokens
    if (provider === "facebook" && page_id) {
      const result = await proxyImage(`https://graph.facebook.com/${page_id}/picture?type=large`);
      if (result) return result;
    }

    // Instagram: uses the new Instagram API (graph.instagram.com, not graph.facebook.com)
    // Fetch fresh profile_picture_url with the stored access token, then immediately proxy it
    if (provider === "instagram" && access_token) {
      const profileRes = await fetch(
        `https://graph.instagram.com/me?fields=profile_picture_url&access_token=${access_token}`
      );
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        const picUrl: string | undefined = profileData?.profile_picture_url;
        if (picUrl) {
          const result = await proxyImage(picUrl);
          if (result) return result;
        }
      }
    }

    // TikTok: refresh expired access token (TikTok tokens last ~24h), then re-fetch
    // avatar_url and proxy it. Without the refresh, a second account whose token has
    // expired since last upload returns 404 and the UI shows an empty avatar circle.
    if (provider === "tiktok" && account.refresh_token) {
      try {
        const tokens = await getTikTokAccessToken({
          refreshToken: account.refresh_token,
          accessToken: access_token,
          expiresAt: account.expiry,
        });
        if (tokens.accessToken !== access_token) {
          access_token = tokens.accessToken;
          // Persist refreshed tokens so the next call doesn't re-refresh
          await supabaseAdmin
            .from("platform_accounts")
            .update({
              access_token: tokens.accessToken,
              refresh_token: tokens.refreshToken,
              expiry: tokens.expiresAt.toISOString(),
            })
            .eq("id", id);
        }
      } catch {
        // Refresh failed — fall through; the call below will likely 401 and we 404.
      }

      const ttRes = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=avatar_url", {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (ttRes.ok) {
        const ttData = await ttRes.json();
        const picUrl: string | undefined = ttData?.data?.user?.avatar_url;
        if (picUrl) {
          const result = await proxyImage(picUrl);
          if (result) return result;
        }
      }
    }

    // Bluesky: re-fetch from public API using DID — no token needed, works for old accounts
    if (provider === "bluesky" && account.platform_user_id) {
      const profileRes = await fetch(
        `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(account.platform_user_id)}`
      );
      if (profileRes.ok) {
        const profile = await profileRes.json();
        if (profile.avatar) {
          const result = await proxyImage(profile.avatar);
          if (result) return result;
        }
      }
    }

    // X (Twitter): stored pbs.twimg.com URL is public — proxy directly
    // YouTube, LinkedIn, and fallback: proxy stored avatar_url directly
    if (avatar_url) {
      const result = await proxyImage(avatar_url);
      if (result) return result;
    }
  } catch {
    // fall through to 404
  }

  return new NextResponse("Avatar unavailable", { status: 404 });
}
