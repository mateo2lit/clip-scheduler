import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext, requireOwnerOrAdmin } from "@/lib/teamAuth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;
    const { userId, teamId, role } = result.ctx;

    const ownerCheck = requireOwnerOrAdmin(role);
    if (ownerCheck) return ownerCheck;

    const { botToken, channelId, label } = await req.json().catch(() => ({}));

    if (!botToken || !channelId) {
      return NextResponse.json({ ok: false, error: "botToken and channelId are required" }, { status: 400 });
    }

    // Validate bot token
    const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    if (!meRes.ok) {
      return NextResponse.json({ ok: false, error: "Invalid bot token" }, { status: 400 });
    }
    const meData = await meRes.json();
    if (!meData.ok) {
      return NextResponse.json({ ok: false, error: meData.description || "Invalid bot token" }, { status: 400 });
    }

    // Validate channel
    const chatRes = await fetch(`https://api.telegram.org/bot${botToken}/getChat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: channelId }),
    });
    const chatData = await chatRes.json();
    if (!chatRes.ok || !chatData.ok) {
      return NextResponse.json({
        ok: false,
        error: chatData.description || "Channel not found. Make sure the bot is added as admin.",
      }, { status: 400 });
    }

    const chatTitle = chatData.result?.title || chatData.result?.username || channelId;
    const accountLabel = label?.trim() || chatTitle;

    // Upsert: platform_user_id = channelId, access_token = botToken
    const { error: upsertErr } = await supabaseAdmin.from("platform_accounts").upsert(
      {
        user_id: userId,
        team_id: teamId,
        provider: "telegram",
        access_token: botToken,
        refresh_token: null,
        platform_user_id: String(channelId).trim(),
        profile_name: accountLabel,
        label: accountLabel,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "team_id,provider,platform_user_id" }
    );

    if (upsertErr) {
      return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, label: accountLabel });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
