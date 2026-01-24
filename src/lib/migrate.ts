import { pool } from "@/lib/db";

export async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scheduled_posts (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      tags JSONB NOT NULL,
      asset_url TEXT NOT NULL,
      scheduled_for TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_scheduled_due
    ON scheduled_posts(status, scheduled_for);
  `);
}
