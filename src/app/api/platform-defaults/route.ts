import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

const VALID_PLATFORMS = ["youtube", "tiktok", "instagram", "facebook", "linkedin"];

export async function GET(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;

    const { userId } = result.ctx;

    const { data, error } = await supabaseAdmin
      .from("platform_defaults")
      .select("*")
      .eq("user_id", userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, defaults: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;

    const { userId, teamId } = result.ctx;
    const body = await req.json();

    const { platform, settings } = body;

    if (!platform || !VALID_PLATFORMS.includes(platform)) {
      return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
    }

    if (!settings || typeof settings !== "object") {
      return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
    }

    // Upsert: update if exists, insert if not
    const { data: existing } = await supabaseAdmin
      .from("platform_defaults")
      .select("id")
      .eq("user_id", userId)
      .eq("platform", platform)
      .maybeSingle();

    let data;
    if (existing) {
      const { data: updated, error } = await supabaseAdmin
        .from("platform_defaults")
        .update({ settings, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("platform", platform)
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      data = updated;
    } else {
      const { data: created, error } = await supabaseAdmin
        .from("platform_defaults")
        .insert({
          user_id: userId,
          team_id: teamId,
          platform,
          settings,
        })
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      data = created;
    }

    return NextResponse.json({ ok: true, default: data });
  } catch (err: any) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
