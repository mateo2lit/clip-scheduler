import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";
import { getYouTubeOAuthClient, getYouTubeApi } from "@/lib/youtube";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;

    const { teamId } = result.ctx;

    const body = await req.json();
    const { platform, commentId, platformAccountId } = body as {
      platform: string;
      commentId: string;
      platformAccountId: string;
    };

    if (!platform || !commentId || !platformAccountId) {
      return NextResponse.json(
        { ok: false, error: "Missing platform, commentId, or platformAccountId" },
        { status: 400 }
      );
    }

    const { data: account } = await supabaseAdmin
      .from("platform_accounts")
      .select("provider, refresh_token, access_token, page_access_token")
      .eq("team_id", teamId)
      .eq("id", platformAccountId)
      .maybeSingle();

    if (!account) {
      return NextResponse.json(
        { ok: false, error: "Account not found" },
        { status: 400 }
      );
    }

    if (platform === "youtube") {
      const auth = await getYouTubeOAuthClient({
        refreshToken: account.refresh_token,
      });
      const youtube = getYouTubeApi(auth);

      await youtube.comments.setModerationStatus({
        id: [commentId],
        moderationStatus: "published",
      });

      return NextResponse.json({ ok: true, note: "YouTube does not support liking comments via API. Comment was approved instead." });
    } else if (platform === "facebook") {
      const token = account.page_access_token;
      if (!token) {
        return NextResponse.json(
          { ok: false, error: "No Facebook page access token found" },
          { status: 400 }
        );
      }

      const url = `https://graph.facebook.com/v21.0/${commentId}/likes`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: token }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Facebook API error ${res.status}`);
      }

      return NextResponse.json({ ok: true });
    } else if (platform === "instagram") {
      // Instagram Graph API does not support liking comments programmatically
      return NextResponse.json({
        ok: true,
        note: "Instagram does not support liking comments via API.",
      });
    } else {
      return NextResponse.json(
        { ok: false, error: `Like not supported for platform: ${platform}` },
        { status: 400 }
      );
    }
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
