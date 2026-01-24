// src/app/api/cron/run-worker/route.ts
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function requireCronSecret(req: Request) {
  const secret = process.env.CRON_SECRET;

  // If no secret set, allow local dev
  if (!secret) return { ok: true as const };

  // Preferred: Authorization: Bearer <secret>
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  // Backwards compatible: x-cron-secret header
  const got = bearer || req.headers.get("x-cron-secret") || "";

  if (got !== secret) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }

  return { ok: true as const };
}

async function runWorker() {
  const now = new Date().toISOString();

  const due = await sql<{ id: string }>`
    SELECT id
    FROM scheduled_posts
    WHERE status = 'scheduled'
      AND scheduled_for <= ${now}::timestamptz
    ORDER BY scheduled_for ASC
    LIMIT 25
  `;

  const processed: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (const r of due.rows) {
    const id = r.id;
    const claimTime = new Date().toISOString();

    const claim = await sql`
      UPDATE scheduled_posts
      SET status = 'processing', updated_at = ${claimTime}::timestamptz
      WHERE id = ${id} AND status = 'scheduled'
    `;

    if (claim.rowCount === 0) continue;

    try {
      // TODO: real platform adapters (YouTube/TikTok/IG)
      const doneTime = new Date().toISOString();

      await sql`
        UPDATE scheduled_posts
        SET status = 'posted', error = NULL, updated_at = ${doneTime}::timestamptz
        WHERE id = ${id}
      `;

      processed.push({ id, ok: true });
    } catch (e: any) {
      const failTime = new Date().toISOString();
      const msg = String(e?.message ?? e);

      await sql`
        UPDATE scheduled_posts
        SET status = 'failed', error = ${msg}, updated_at = ${failTime}::timestamptz
        WHERE id = ${id}
      `;

      processed.push({ id, ok: false, error: msg });
    }
  }

  return { now, found: due.rows.length, processed };
}

export async function POST(req: Request) {
  try {
    const gate = requireCronSecret(req);
    if (!gate.ok) return jsonError(gate.error, gate.status);

    const result = await runWorker();
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("POST /api/cron/run-worker failed:", err?.message ?? err);
    return jsonError(err?.message ?? "Worker crashed");
  }
}

export async function GET(req: Request) {
  try {
    const gate = requireCronSecret(req);
    if (!gate.ok) return jsonError(gate.error, gate.status);

    const result = await runWorker();
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("GET /api/cron/run-worker failed:", err?.message ?? err);
    return jsonError(err?.message ?? "Worker crashed");
  }
}
