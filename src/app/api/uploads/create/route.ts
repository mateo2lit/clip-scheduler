import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;

    const { userId, teamId } = result.ctx;

    // Check plan status — block uploads without active plan
    const { data: team } = await supabaseAdmin
      .from("teams")
      .select("plan_status, plan")
      .eq("id", teamId)
      .single();

    const status = team?.plan_status;
    if (status !== "trialing" && status !== "active") {
      return NextResponse.json(
        { ok: false, error: "Subscribe to upload videos" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const bucket = typeof body.bucket === "string" ? body.bucket : null;
    const file_path = typeof body.file_path === "string" ? body.file_path : null;
    const file_size = typeof body.file_size === "number" && body.file_size > 0 ? body.file_size : null;

    if (!bucket || !file_path) {
      return NextResponse.json(
        { ok: false, error: "Missing bucket or file_path" },
        { status: 400 }
      );
    }

    // Check active storage usage against plan limit
    const STORAGE_LIMITS: Record<string, number> = {
      creator: 5 * 1024 * 1024 * 1024,   // 5 GB
      team:    15 * 1024 * 1024 * 1024,   // 15 GB
    };
    const planLimit = STORAGE_LIMITS[team?.plan ?? ""] ?? STORAGE_LIMITS.creator;

    const { data: usageRows } = await supabaseAdmin
      .from("uploads")
      .select("file_size")
      .eq("team_id", teamId)
      .eq("storage_deleted", false)
      .not("file_size", "is", null);

    const activeBytes = (usageRows ?? []).reduce((sum: number, row: any) => sum + (row.file_size ?? 0), 0);
    const incomingBytes = file_size ?? 0;

    if (activeBytes + incomingBytes > planLimit) {
      const limitGB = planLimit / (1024 * 1024 * 1024);
      return NextResponse.json(
        { ok: false, error: `Storage limit reached (${limitGB} GB). Delete drafts or wait for posted videos to be cleaned up.` },
        { status: 403 }
      );
    }

    // Insert with service role (bypasses RLS)
    const { data, error } = await supabaseAdmin
      .from("uploads")
      .insert({
        user_id: userId,
        team_id: teamId,
        bucket,
        file_path,
        file_size,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
