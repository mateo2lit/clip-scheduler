import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import crypto from "crypto";

export const runtime = "nodejs";

function nowIso() {
  return new Date().toISOString();
}

function safeJsonParse(value: string, fallback: any) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export async function GET() {
  const rows = db
    .prepare(`SELECT * FROM scheduled_posts ORDER BY datetime(created_at) DESC`)
    .all();

  const data = rows.map((r: any) => ({
    ...r,
    tags: safeJsonParse(r.tags, []),
  }));

  return NextResponse.json({ ok: true, data });
}

export async function POST(req: Request) {
  const body = await req.json();

  const platform = String(body.platform ?? "youtube");
  const title = String(body.title ?? "");
  const description = String(body.description ?? "");
  const tags = Array.isArray(body.tags) ? body.tags : [];
  const assetUrl = String(body.assetUrl ?? "");
  const scheduledFor = String(body.scheduledFor ?? "");

  if (!title || !assetUrl || !scheduledFor) {
    return NextResponse.json(
      { ok: false, error: "Missing title, assetUrl, or scheduledFor" },
      { status: 400 }
    );
  }

  const id = crypto.randomUUID();
  const ts = nowIso();

  db.prepare(`
    INSERT INTO scheduled_posts
      (id, platform, title, description, tags, asset_url, scheduled_for, status, error, created_at, updated_at)
    VALUES
      (@id, @platform, @title, @description, @tags, @asset_url, @scheduled_for, @status, @error, @created_at, @updated_at)
  `).run({
    id,
    platform,
    title,
    description,
    tags: JSON.stringify(tags),
    asset_url: assetUrl,
    scheduled_for: scheduledFor,
    status: "scheduled",
    error: null,
    created_at: ts,
    updated_at: ts,
  });

  return NextResponse.json({ ok: true, id });
}
