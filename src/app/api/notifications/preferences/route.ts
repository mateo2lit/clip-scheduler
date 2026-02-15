import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export async function GET(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;

    const { userId, teamId } = result.ctx;

    // Try to get existing preferences
    let { data, error } = await supabaseAdmin
      .from("notification_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Create defaults if none exist
    if (!data) {
      const { data: created, error: createErr } = await supabaseAdmin
        .from("notification_preferences")
        .insert({
          user_id: userId,
          team_id: teamId,
          notify_post_success: true,
          notify_post_failed: true,
          notify_reconnect: true,
        })
        .select()
        .single();

      if (createErr) {
        return NextResponse.json({ error: createErr.message }, { status: 500 });
      }

      data = created;
    }

    return NextResponse.json({ ok: true, preferences: data });
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

    const updates: any = { updated_at: new Date().toISOString() };
    if (typeof body.notify_post_success === "boolean") updates.notify_post_success = body.notify_post_success;
    if (typeof body.notify_post_failed === "boolean") updates.notify_post_failed = body.notify_post_failed;
    if (typeof body.notify_reconnect === "boolean") updates.notify_reconnect = body.notify_reconnect;

    // Upsert: update if exists, insert if not
    const { data: existing } = await supabaseAdmin
      .from("notification_preferences")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    let data;
    if (existing) {
      const { data: updated, error } = await supabaseAdmin
        .from("notification_preferences")
        .update(updates)
        .eq("user_id", userId)
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      data = updated;
    } else {
      const { data: created, error } = await supabaseAdmin
        .from("notification_preferences")
        .insert({
          user_id: userId,
          team_id: teamId,
          notify_post_success: body.notify_post_success ?? true,
          notify_post_failed: body.notify_post_failed ?? true,
          notify_reconnect: body.notify_reconnect ?? true,
        })
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      data = created;
    }

    return NextResponse.json({ ok: true, preferences: data });
  } catch (err: any) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
