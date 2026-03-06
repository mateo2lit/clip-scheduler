import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";
import { blueskyLogin } from "@/lib/blueskyUpload";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;
    const { userId, teamId } = result.ctx;

    const { handle, appPassword } = await req.json().catch(() => ({}));

    if (!handle || !appPassword) {
      return NextResponse.json({ ok: false, error: "handle and appPassword are required" }, { status: 400 });
    }

    // Authenticate with Bluesky
    const session = await blueskyLogin(handle.trim(), appPassword.trim());

    // Fetch profile to get display name and avatar
    const displayName = session.handle || handle.replace(/^@/, "");
    let avatarUrl: string | null = null;
    try {
      const profileRes = await fetch(
        `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(session.did)}`
      );
      if (profileRes.ok) {
        const profile = await profileRes.json();
        avatarUrl = profile.avatar ?? null;
      }
    } catch {
      // Non-fatal — avatar stays null
    }

    // Upsert platform_accounts.
    // onConflict uses "team_id,provider,platform_user_id" after the multi-channel DB migration.
    const { error: upsertErr } = await supabaseAdmin.from("platform_accounts").upsert(
      {
        user_id: userId,
        team_id: teamId,
        provider: "bluesky",
        access_token: session.accessJwt,
        refresh_token: session.refreshJwt,
        platform_user_id: session.did,
        profile_name: displayName,
        avatar_url: avatarUrl,
        label: displayName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "team_id,provider,platform_user_id" }
    );

    if (upsertErr) {
      return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
