import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    // 1) Verify auth header (matches your uploads/create pattern)
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return NextResponse.json({ error: "Missing Authorization bearer token" }, { status: 401 });
    }

    // 2) Validate token and derive user_id from Supabase Auth (do NOT trust client user_id)
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);

    if (userErr || !userData?.user?.id) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }

    const user_id = userData.user.id;

    // 3) Parse body
    const body = await req.json();

    const {
      upload_id,
      provider,
      title,
      description,
      privacy_status,
      scheduled_for,
      tiktok_settings,
    } = body;

    if (!upload_id || !scheduled_for) {
      return NextResponse.json(
        { error: "Missing required fields: upload_id, scheduled_for" },
        { status: 400 }
      );
    }

    // 4) Insert scheduled post via admin client (bypass RLS)
    const insertRow: any = {
      user_id,
      upload_id,
      provider: provider ?? "youtube",
      title: title ?? "Untitled Clip",
      description: description ?? "",
      privacy_status: privacy_status ?? "private",
      scheduled_for,
      status: "scheduled",
    };

    if (tiktok_settings && provider === "tiktok") {
      insertRow.tiktok_settings = tiktok_settings;
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
