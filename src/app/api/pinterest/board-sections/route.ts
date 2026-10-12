import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";

/** Sections of one of the team's Pinterest boards, for the optional "Board section" picker. */
export async function GET(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;
    const { teamId } = result.ctx;

    const boardId = new URL(req.url).searchParams.get("boardId") ?? "";
    if (!/^\d+$/.test(boardId)) {
      return NextResponse.json({ ok: false, error: "Invalid boardId" }, { status: 400 });
    }

    const { data: account } = await supabaseAdmin
      .from("platform_accounts")
      .select("access_token")
      .eq("team_id", teamId)
      .eq("provider", "pinterest")
      .limit(1)
      .maybeSingle();

    if (!account?.access_token) {
      return NextResponse.json({ ok: false, error: "Pinterest not connected" }, { status: 404 });
    }

    const res = await fetch(`https://api.pinterest.com/v5/boards/${boardId}/sections?page_size=100`, {
      headers: { Authorization: `Bearer ${account.access_token}` },
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ ok: false, error: `Pinterest sections fetch failed: ${res.status} ${text}` }, { status: 502 });
    }

    const data = await res.json();
    const sections = (data.items ?? []).map((s: any) => ({ id: String(s.id), name: s.name }));

    return NextResponse.json({ ok: true, sections });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
