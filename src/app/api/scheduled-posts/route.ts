// src/app/api/scheduled-posts/route.ts
import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { requireUserIdFromRequest } from "@/lib/supabaseServer";

export const runtime = "nodejs";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(req: Request) {
  try {
    const auth = await requireUserIdFromRequest(req);
    if (!auth.ok) return jsonError(auth.error, auth.status);

    // IMPORTANT: Postgres does not have datetime(). Use timestamptz casting + ORDER BY.
    const { rows } = await sql`
      SELECT *
      FROM scheduled_posts
      WHERE user_id = ${auth.userId}
      ORDER BY scheduled_for::timestamptz ASC, created_at::timestamptz DESC
    `;

    return NextResponse.json({ ok: true, data: rows });
  } catch (err: any) {
    console.error("GET /api/scheduled-posts failed:", err?.message ?? err);
    return jsonError(err?.message ?? "Failed to load scheduled posts");
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireUserIdFromRequest(req);
    if (!auth.ok) return jsonError(auth.error, auth.status);

    const body = await req.json().catch(() => ({}));
    const {
      platform = "youtube",
      title = "",
      description = "",
      tags = [],
      assetUrl = "",
      scheduledFor = "",
    } = body;

    if (!title || !assetUrl || !scheduledFor) {
      return jsonError("Missing title, assetUrl, or scheduledFor", 400);
    }

    // Validate scheduledFor is parseable
    const scheduledDate = new Date(scheduledFor);
    if (Number.isNaN(scheduledDate.getTime())) {
      return jsonError("scheduledFor must be a valid ISO timestamp", 400);
    }

    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const now = new Date().toISOString();

    await sql`
      INSERT INTO scheduled_posts
        (id, user_id, platform, title, description, tags, asset_url, scheduled_for, status, created_at, updated_at)
      VALUES
        (
          ${id},
          ${auth.userId},
          ${platform},
          ${title},
          ${description},
          ${JSON.stringify(tags)},
          ${assetUrl},
          ${scheduledFor},
          'scheduled',
          ${now},
          ${now}
        )
    `;

    return NextResponse.json({ ok: true, id });
  } catch (err: any) {
    console.error("POST /api/scheduled-posts failed:", err?.message ?? err);
    return jsonError(err?.message ?? "Failed to create scheduled post");
  }
}
