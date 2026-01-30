import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    deployedAt: new Date().toISOString(),
    commitHint: process.env.VERCEL_GIT_COMMIT_SHA || null,
  });
}
