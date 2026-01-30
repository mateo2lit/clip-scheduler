import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function requireUser(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7)
    : "";

  if (!token) {
    return { user: null as any, error: jsonError("Missing Authorization token", 401) };
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    return { user: null as any, error: jsonError("Invalid session", 401) };
  }

  return { user: data.user, error: null };
}

/**
 * GET /api/scheduled-posts
 * Returns current user's scheduled_posts (recent first)
 */
export async function GET(req: Request) {
  try {
    const { user, error } = await requireUser(req);
    if (error) return error;

    const url = new URL(req.url);
    const status = url.searchParams.get("status"); // optional filter
    const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200);

    let q = supabaseAdmin
      .from("scheduled_posts")
      .select("*")
      .eq("user_id", user.id)
      .order("scheduled_for", { ascending: false })
      .limit(limit);

    if (status) q = q.eq("status", status);

    const { data, error: dbErr } = await q;
    if (dbErr) return jsonError(dbErr.message, 500);

    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (e: any) {
    console.error("GET /api/scheduled-posts failed:", e?.message ?? e);
    return jsonError(e?.message ?? "Server error", 500);
  }
}

/**
 * POST /api/scheduled-posts
 * Creates a scheduled post for the current user.
 *
 * Expected JSON:
 * {
 *   upload_id: string,
 *   scheduled_for: string (ISO),
 *   platforms?: string[] | string,
 *   provider?: "youtube" | null,
 *   title?: string,
 *   description?: string,
 *   privacy_status?: "private"|"public"|"unlisted"
 * }
 */
export async function POST(req: Request) {
  try {
    const { user, error } = await requireUser(req);
    if (error) return error;

    const body = await req.json().catch(() => ({}));

    const upload_id = String(body.upload_id || "");
    const scheduled_for = String(body.scheduled_for || "");

    if (!upload_id) return jsonError("upload_id is required", 400);
    if (!scheduled_for) return jsonError("scheduled_for is required", 400);

    const platformsRaw = body.platforms ?? body.provider ?? [];
    const platforms = Array.isArray(platformsRaw)
      ? platformsRaw
      : platformsRaw
      ? [platformsRaw]
      : [];

    const provider =
      typeof body.provider === "string" && body.provider.length ? body.provider : null;

    const title = typeof body.title === "string" ? body.title : null;
    const description = typeof body.description === "string" ? body.description : null;
    const privacy_status =
      typeof body.privacy_status === "string" ? body.privacy_status : null;

    // Optional: Fetch upload filename/title for convenience fields if your table has them
    const { data: uploadRow } = await supabaseAdmin
      .from("uploads")
      .select("id, user_id, file_name, title")
      .eq("id", upload_id)
      .eq("user_id", user.id)
      .maybeSingle();

    // Insert scheduled post
    const insert = {
      user_id: user.id,
      upload_id,
      scheduled_for,
      status: "scheduled",
      provider,
      platforms: platforms.length ? platforms : null,
      title,
      description,
      privacy_status,

      // These are optional fields your worker/dashboard already reference.
      // If your DB doesn't have these columns, remove them.
      upload_title: uploadRow?.title ?? null,
      upload_file_name: uploadRow?.file_name ?? null,
      last_error: null,
    };

    const { data, error: insErr } = await supabaseAdmin
      .from("scheduled_posts")
      .insert(insert)
      .select("*")
      .single();

    if (insErr) return jsonError(insErr.message, 500);

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    console.error("POST /api/scheduled-posts failed:", e?.message ?? e);
    return jsonError(e?.message ?? "Server error", 500);
  }
}
