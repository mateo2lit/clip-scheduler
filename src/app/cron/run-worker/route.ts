import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { ensureSchema } from "@/lib/migrate";

export const runtime = "nodejs";

async function fakeUpload() {
  await new Promise((r) => setTimeout(r, 500));
  return { success: true };
}

export async function GET() {
  await ensureSchema();

  const now = new Date().toISOString();

  const { rows } = await pool.query(
    `
    SELECT *
    FROM scheduled_posts
    WHERE status = 'scheduled'
      AND scheduled_for <= $1
    ORDER BY scheduled_for ASC
    LIMIT 10
  `,
    [now]
  );

  let posted = 0;

  for (const post of rows) {
    const lock = await pool.query(
      `
      UPDATE scheduled_posts
      SET status = 'processing', updated_at = $1
      WHERE id = $2 AND status = 'scheduled'
    `,
      [now, post.id]
    );

    if (lock.rowCount === 0) continue;

    const res = await fakeUpload();

    if (res.success) {
      await pool.query(
        `
        UPDATE scheduled_posts
        SET status = 'posted', updated_at = $1
        WHERE id = $2
      `,
        [new Date().toISOString(), post.id]
      );
      posted++;
    }
  }

  return NextResponse.json({
    ok: true,
    processed: rows.length,
    posted,
  });
}
