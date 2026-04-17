import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;
    const { teamId } = result.ctx;

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

    const res = await fetch("https://api.pinterest.com/v5/boards?page_size=50", {
      headers: { Authorization: `Bearer ${account.access_token}` },
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ ok: false, error: `Pinterest boards fetch failed: ${res.status} ${text}` }, { status: 502 });
    }

    const data = await res.json();
    const boards = (data.items ?? []).map((b: any) => ({ id: b.id, name: b.name }));

    return NextResponse.json({ ok: true, boards });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
