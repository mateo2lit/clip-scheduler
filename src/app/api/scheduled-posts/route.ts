import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * GET /api/scheduled-posts
 * Returns the logged-in user's scheduled posts
 */
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7)
      : "";

    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Missing Authorization token" },
        { status: 401 }
      );
    }

    // Validate user session
    const { data: userData, error: userErr } =
      await supabaseAdmin.auth.getUser(token);

    if (userErr || !userData?.user) {
      return NextResponse.json(
        { ok: false, error: "Invalid session" },
        { status: 401 }
      );
    }

    const userId = userData.user.id;

    // Fetch scheduled posts
    const { data, error } = await supabaseAdmin
      .from("scheduled_posts")
      .select("*")
      .eq("user_id", userId)
      .order("scheduled_for", { ascending: true });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (e: any) {
    console.error("GET /api/scheduled-posts failed:", e?.message ?? e);
    return NextResponse.json(
      { ok: false, error: "Server error" },
      { status: 500 }
    );
  }
}
