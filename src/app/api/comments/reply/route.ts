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
    const { platform, commentId, text } = body as {
      platform: string;
      commentId: string;
      text: string;
    };

    if (!platform || !commentId || !text?.trim()) {
      return NextResponse.json(
        { ok: false, error: "Missing platform, commentId, or text" },
        { status: 400 }
      );
    }

    // Load platform account
    const { data: account } = await supabaseAdmin
      .from("platform_accounts")
      .select("provider, refresh_token, access_token, page_access_token")
      .eq("team_id", teamId)
      .eq("provider", platform)
      .maybeSingle();

    if (!account) {
      return NextResponse.json(
        { ok: false, error: `No ${platform} account connected` },
        { status: 400 }
      );
    }

    if (platform === "youtube") {
      const auth = await getYouTubeOAuthClient({
        refreshToken: account.refresh_token,
      });
      const youtube = getYouTubeApi(auth);

      await youtube.comments.insert({
        part: ["snippet"],
        requestBody: {
          snippet: {
            parentId: commentId,
            textOriginal: text.trim(),
          },
        },
      });
    } else if (platform === "facebook") {
      const token = account.page_access_token;
      if (!token) {
        return NextResponse.json(
          { ok: false, error: "No Facebook page access token found" },
          { status: 400 }
        );
      }

      const url = `https://graph.facebook.com/v21.0/${commentId}/comments`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim(), access_token: token }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          err?.error?.message || `Facebook API error ${res.status}`
        );
      }
    } else if (platform === "instagram") {
      const token = account.access_token;
      if (!token) {
        return NextResponse.json(
          { ok: false, error: "No Instagram access token found" },
          { status: 400 }
        );
      }

      const url = `https://graph.instagram.com/v21.0/${commentId}/replies`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim(), access_token: token }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          err?.error?.message || `Instagram API error ${res.status}`
        );
      }
    } else {
      return NextResponse.json(
        { ok: false, error: `Unsupported platform: ${platform}` },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
