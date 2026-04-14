import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";
import { fetchPublicProfile } from "@/lib/competitorFetchers";

export const runtime = "nodejs";

// GET - list competitors with your own stats for comparison
export async function GET(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;

    const { teamId } = result.ctx;

    const { data: competitors } = await supabaseAdmin
      .from("competitor_profiles")
      .select("*")
      .eq("team_id", teamId)
      .order("follower_count", { ascending: false });

    // Get history for growth calculations (last 30 days)
    const competitorData = [];
    for (const c of competitors || []) {
      const { data: snapshots } = await supabaseAdmin
        .from("competitor_snapshots")
        .select("follower_count, post_count, snapshot_date")
        .eq("competitor_id", c.id)
        .order("snapshot_date", { ascending: true })
        .limit(30);

      // Calculate 7-day and 30-day growth
      const history = snapshots || [];
      const current = c.follower_count;
      const weekAgo = history.find(
        (s: any) => new Date(s.snapshot_date).getTime() <= Date.now() - 7 * 24 * 60 * 60 * 1000
      );
      const monthAgo = history[0];
      const growth7d = weekAgo ? current - weekAgo.follower_count : null;
      const growth30d = monthAgo && history.length >= 2 ? current - monthAgo.follower_count : null;

      competitorData.push({
        ...c,
        history,
        growth7d,
        growth30d,
      });
    }

    // Get user's own stats per platform for side-by-side comparison
    const { data: ownAccounts } = await supabaseAdmin
      .from("platform_accounts")
      .select("id, provider, profile_name")
      .eq("team_id", teamId);

    // Aggregate own followers per platform from latest snapshots
    const { data: ownSnapshots } = await supabaseAdmin
      .from("follower_snapshots")
      .select("provider, follower_count, snapshot_date, platform_account_id")
      .eq("team_id", teamId)
      .order("snapshot_date", { ascending: false });

    const ownStatsByPlatform: Record<string, { current: number; weekAgo: number | null }> = {};
    const seenAccounts = new Set<string>();
    const weekAgoCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

    // Latest snapshot per account
    for (const snap of ownSnapshots || []) {
      if (seenAccounts.has(snap.platform_account_id)) continue;
      seenAccounts.add(snap.platform_account_id);
      if (!ownStatsByPlatform[snap.provider]) {
        ownStatsByPlatform[snap.provider] = { current: 0, weekAgo: null };
      }
      ownStatsByPlatform[snap.provider].current += snap.follower_count;
    }

    // 7-day ago snapshot per account
    const seenForWeek = new Set<string>();
    for (const snap of ownSnapshots || []) {
      if (seenForWeek.has(snap.platform_account_id)) continue;
      if (new Date(snap.snapshot_date).getTime() > weekAgoCutoff) continue;
      seenForWeek.add(snap.platform_account_id);
      if (ownStatsByPlatform[snap.provider]) {
        ownStatsByPlatform[snap.provider].weekAgo =
          (ownStatsByPlatform[snap.provider].weekAgo || 0) + snap.follower_count;
      }
    }

    return NextResponse.json({
      ok: true,
      competitors: competitorData,
      ownStats: ownStatsByPlatform,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}

// POST - add a competitor
export async function POST(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;

    const body = await req.json();
    const { platform, handle } = body;

    if (!platform || !handle) {
      return NextResponse.json({ ok: false, error: "Platform and handle are required" }, { status: 400 });
    }

    // Check limit (max 10 competitors)
    const { count } = await supabaseAdmin
      .from("competitor_profiles")
      .select("id", { count: "exact", head: true })
      .eq("team_id", result.ctx.teamId);

    if ((count || 0) >= 10) {
      return NextResponse.json({ ok: false, error: "Maximum 10 competitors allowed" }, { status: 400 });
    }

    // Fetch public profile data
    const profile = await fetchPublicProfile(platform, handle);

    const { data: created, error: createErr } = await supabaseAdmin
      .from("competitor_profiles")
      .upsert(
        {
          team_id: result.ctx.teamId,
          platform,
          handle,
          display_name: profile?.display_name || handle,
          avatar_url: profile?.avatar_url || null,
          follower_count: profile?.follower_count || 0,
          following_count: profile?.following_count || 0,
          post_count: profile?.post_count || 0,
          last_fetched_at: profile ? new Date().toISOString() : null,
        },
        { onConflict: "team_id,platform,handle" }
      )
      .select()
      .single();

    if (createErr) throw createErr;

    // Create initial snapshot
    if (profile) {
      await supabaseAdmin.from("competitor_snapshots").upsert(
        {
          competitor_id: created.id,
          follower_count: profile.follower_count,
          post_count: profile.post_count,
          snapshot_date: new Date().toISOString().split("T")[0],
        },
        { onConflict: "competitor_id,snapshot_date" }
      );
    }

    return NextResponse.json({ ok: true, competitor: created });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}

// DELETE - remove a competitor
export async function DELETE(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;

    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing competitor ID" }, { status: 400 });
    }

    await supabaseAdmin
      .from("competitor_profiles")
      .delete()
      .eq("id", id)
      .eq("team_id", result.ctx.teamId);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
