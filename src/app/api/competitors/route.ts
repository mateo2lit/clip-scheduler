import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";

async function fetchPublicProfile(platform: string, handle: string): Promise<{
  display_name: string;
  avatar_url: string | null;
  follower_count: number;
  following_count: number;
  post_count: number;
} | null> {
  try {
    if (platform === "youtube") {
      // YouTube public API (requires API key)
      const apiKey = process.env.GOOGLE_API_KEY || process.env.YOUTUBE_API_KEY;
      if (!apiKey) return null;
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&forHandle=${encodeURIComponent(handle)}&key=${apiKey}`
      );
      const data = await res.json();
      const ch = data.items?.[0];
      if (!ch) return null;
      return {
        display_name: ch.snippet?.title || handle,
        avatar_url: ch.snippet?.thumbnails?.default?.url || null,
        follower_count: parseInt(ch.statistics?.subscriberCount || "0", 10),
        following_count: 0,
        post_count: parseInt(ch.statistics?.videoCount || "0", 10),
      };
    }

    if (platform === "bluesky") {
      const res = await fetch(
        `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`
      );
      const data = await res.json();
      if (data.error) return null;
      return {
        display_name: data.displayName || handle,
        avatar_url: data.avatar || null,
        follower_count: data.followersCount || 0,
        following_count: data.followsCount || 0,
        post_count: data.postsCount || 0,
      };
    }

    // For platforms requiring auth (TikTok, Instagram, X), return null
    // Users can manually enter data or we can add API support later
    return null;
  } catch {
    return null;
  }
}

// GET - list competitors
export async function GET(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;

    const { data: competitors } = await supabaseAdmin
      .from("competitor_profiles")
      .select("*")
      .eq("team_id", result.ctx.teamId)
      .order("created_at", { ascending: true });

    // Get latest snapshots for growth data
    const competitorData = [];
    for (const c of competitors || []) {
      const { data: snapshots } = await supabaseAdmin
        .from("competitor_snapshots")
        .select("follower_count, post_count, snapshot_date")
        .eq("competitor_id", c.id)
        .order("snapshot_date", { ascending: true })
        .limit(30);

      competitorData.push({
        ...c,
        history: snapshots || [],
      });
    }

    return NextResponse.json({ ok: true, competitors: competitorData });
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
