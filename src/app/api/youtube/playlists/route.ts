import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";
import { getYouTubeOAuthClient, getYouTubeApi } from "@/lib/youtube";

export const runtime = "nodejs";

// Lists the playlists of one connected YouTube channel so the upload page can
// offer "Add to playlist". Playlists belong to a channel, hence ?accountId=.
export async function GET(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;
    const { teamId } = result.ctx;

    const accountId = new URL(req.url).searchParams.get("accountId");
    if (!accountId) {
      return NextResponse.json({ ok: false, error: "Missing accountId" }, { status: 400 });
    }

    const { data: account } = await supabaseAdmin
      .from("platform_accounts")
      .select("refresh_token")
      .eq("id", accountId)
      .eq("team_id", teamId)
      .eq("provider", "youtube")
      .maybeSingle();

    if (!account?.refresh_token) {
      return NextResponse.json({ ok: false, error: "YouTube account not connected" }, { status: 404 });
    }

    const auth = await getYouTubeOAuthClient({ refreshToken: account.refresh_token });
    const youtube = getYouTubeApi(auth);
    const res = await youtube.playlists.list({ part: ["snippet"], mine: true, maxResults: 50 });

    const playlists = (res.data.items ?? [])
      .filter((p) => p.id)
      .map((p) => ({ id: p.id as string, title: p.snippet?.title || "Untitled playlist" }));

    return NextResponse.json({ ok: true, playlists });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
