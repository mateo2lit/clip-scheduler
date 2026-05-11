import { NextResponse } from "next/server";
import { getTeamContext } from "@/lib/teamAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTikTokAccessToken } from "@/lib/tiktok";

export async function GET(req: Request) {
  const auth = await getTeamContext(req);
  if (!auth.ok) return auth.error;

  const { teamId } = auth.ctx;
  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("accountId");

  // Look up TikTok platform account for this team.
  // When accountId is provided, scope the lookup to that specific account (still team-scoped for safety).
  // Otherwise, pick the first matching TikTok row — multiple accounts per team are allowed,
  // so .maybeSingle() would incorrectly error in that case.
  let query = supabaseAdmin
    .from("platform_accounts")
    .select("id, user_id, access_token, refresh_token, expiry")
    .eq("team_id", teamId)
    .eq("provider", "tiktok");

  if (accountId) query = query.eq("id", accountId);

  const { data: rows, error: acctErr } = await query.limit(1);
  const acct = rows?.[0];

  if (acctErr || !acct) {
    return NextResponse.json(
      { ok: false, error: "TikTok account not connected" },
      { status: 404 }
    );
  }

  if (!acct.refresh_token) {
    return NextResponse.json(
      { ok: false, error: "TikTok account missing refresh token. Please reconnect." },
      { status: 400 }
    );
  }

  // Get fresh access token
  const tokens = await getTikTokAccessToken({
    refreshToken: acct.refresh_token,
    accessToken: acct.access_token,
    expiresAt: acct.expiry,
  });

  // Persist refreshed tokens
  await supabaseAdmin
    .from("platform_accounts")
    .update({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expiry: tokens.expiresAt.toISOString(),
    })
    .eq("id", acct.id);

  // Query TikTok creator info
  const res = await fetch(
    "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { ok: false, error: `TikTok creator info failed: ${res.status} ${text}` },
      { status: 502 }
    );
  }

  const data = await res.json();

  if (data.error?.code && data.error.code !== "ok") {
    return NextResponse.json(
      { ok: false, error: `TikTok error: ${data.error.code} - ${data.error.message}` },
      { status: 502 }
    );
  }

  const info = data.data || {};

  return NextResponse.json({
    ok: true,
    account_id: acct.id,
    creator_info: {
      nickname: info.creator_nickname || null,
      privacy_level_options: info.privacy_level_options || [],
      comment_disabled: info.comment_disabled ?? false,
      duet_disabled: info.duet_disabled ?? false,
      stitch_disabled: info.stitch_disabled ?? false,
      max_video_post_duration_sec: info.max_video_post_duration_sec ?? 0,
      can_post: info.can_post ?? true,
    },
  });
}
