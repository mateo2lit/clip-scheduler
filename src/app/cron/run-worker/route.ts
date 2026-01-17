import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

function isoNow() {
  return new Date().toISOString();
}

// Fake uploader for now
async function fakeUpload(_post: any) {
  await new Promise((r) => setTimeout(r, 800));
  return { success: true };
}

export async function GET() {
  const startedAt = Date.now();
  const now = isoNow();

  const due = db
    .prepare(`
      SELECT * FROM scheduled_posts
      WHERE status = 'scheduled'
        AND datetime(scheduled_for) <= datetime(?)
      ORDER BY datetime(scheduled_for) ASC
      LIMIT 10
    `)
    .all(now);

  let processed = 0;
  let posted = 0;
  let failed = 0;

  for (const post of due as any[]) {
    const lock = db
      .prepare(`
        UPDATE scheduled_posts
        SET status = 'processing', updated_at = ?
        WHERE id = ? AND status = 'scheduled'
      `)
      .run(now, post.id);

    if (lock.changes === 0) continue;

    processed++;

    try {
      const res = await fakeUpload(post);

      if (res.success) {
        db.prepare(`
          UPDATE scheduled_posts
          SET status = 'posted', error = NULL, updated_at = ?
          WHERE id = ?
        `).run(isoNow(), post.id);
        posted++;
      } else {
        db.prepare(`
          UPDATE scheduled_posts
          SET status = 'failed', error = ?, updated_at = ?
          WHERE id = ?
        `).run("Upload failed (fake)", isoNow(), post.id);
        failed++;
      }
    } catch (e: any) {
      db.prepare(`
        UPDATE scheduled_posts
        SET status = 'failed', error = ?, updated_at = ?
        WHERE id = ?
      `).run(String(e?.message ?? e), isoNow(), post.id);
      failed++;
    }
  }

  return NextResponse.json({
    ok: true,
    dueFound: due.length,
    processed,
    posted,
    failed,
    ms: Date.now() - startedAt,
  });
}
