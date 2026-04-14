import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;

    const { teamId } = result.ctx;

    const url = new URL(req.url);
    const range = (url.searchParams.get("range") || "1m").toLowerCase();

    const rangeMs: Record<string, number> = {
      "24h": 1 * 24 * 60 * 60 * 1000,
      "1w": 7 * 24 * 60 * 60 * 1000,
      "1m": 30 * 24 * 60 * 60 * 1000,
      "1y": 365 * 24 * 60 * 60 * 1000,
    };

    const windowMs = rangeMs[range] ?? rangeMs["1m"];
    const sinceDate = new Date(Date.now() - windowMs).toISOString().split("T")[0];

    const { data: snapshots, error } = await supabaseAdmin
      .from("follower_snapshots")
      .select("provider, follower_count, snapshot_date")
      .eq("team_id", teamId)
      .gte("snapshot_date", sinceDate)
      .order("snapshot_date", { ascending: true });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Group by date, aggregate by platform
    const byDate = new Map<string, Record<string, number>>();
    for (const s of snapshots || []) {
      const dateKey = s.snapshot_date;
      if (!byDate.has(dateKey)) byDate.set(dateKey, {});
      const day = byDate.get(dateKey)!;
      // Sum if multiple accounts for same provider
      day[s.provider] = (day[s.provider] || 0) + s.follower_count;
    }

    const chartData = Array.from(byDate.entries()).map(([date, platforms]) => ({
      date,
      ...platforms,
      total: Object.values(platforms).reduce((s, v) => s + v, 0),
    }));

    // Get latest totals per platform
    const latestTotals: Record<string, number> = {};
    if (chartData.length > 0) {
      const latest = chartData[chartData.length - 1];
      for (const [key, val] of Object.entries(latest)) {
        if (key !== "date" && key !== "total") latestTotals[key] = val as number;
      }
    }

    return NextResponse.json({
      ok: true,
      chartData,
      latestTotals,
      totalFollowers: Object.values(latestTotals).reduce((s, v) => s + v, 0),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
