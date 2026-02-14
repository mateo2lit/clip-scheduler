import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export async function POST(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;

    const { userId, teamId } = result.ctx;

    // Check plan status
    const { data: team } = await supabaseAdmin
      .from("teams")
      .select("plan_status")
      .eq("id", teamId)
      .single();

    const status = team?.plan_status;
    if (status !== "trialing" && status !== "active") {
      return NextResponse.json(
        { error: "Subscribe to schedule posts" },
        { status: 403 }
      );
    }

    // Parse body
    const body = await req.json();

    const {
      upload_id,
      provider,
      title,
      description,
      privacy_status,
      scheduled_for,
      status: requestedStatus,
      tiktok_settings,
      facebook_settings,
      instagram_settings,
      thumbnail_path,
    } = body;

    const isDraft = requestedStatus === "draft";

    if (!upload_id || (!isDraft && !scheduled_for)) {
      return NextResponse.json(
        { error: "Missing required fields: upload_id, scheduled_for" },
        { status: 400 }
      );
    }

    // Insert scheduled post via admin client (bypass RLS)
    const insertRow: any = {
      user_id: userId,
      team_id: teamId,
      upload_id,
      provider: provider ?? "youtube",
      title: title ?? "Untitled Clip",
      description: description ?? "",
      privacy_status: privacy_status ?? "private",
      scheduled_for: scheduled_for || null,
      status: isDraft ? "draft" : "scheduled",
    };

    if (thumbnail_path) {
      insertRow.thumbnail_path = thumbnail_path;
    }

    if (tiktok_settings && provider === "tiktok") {
      insertRow.tiktok_settings = tiktok_settings;
    }

    if (facebook_settings && provider === "facebook") {
      insertRow.facebook_settings = facebook_settings;
    }

    if (instagram_settings && provider === "instagram") {
      insertRow.instagram_settings = instagram_settings;
    }

    const { data, error } = await supabaseAdmin
      .from("scheduled_posts")
      .insert([insertRow])
      .select()
      .single();

    if (error) {
      console.error("scheduled_posts insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ scheduledPost: data });
  } catch (err: any) {
    console.error("API create scheduled_posts failed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
