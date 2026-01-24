// src/app/api/platform-accounts/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : "";
    if (!token) return jsonError("Missing Authorization token", 401);

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) return jsonError("Invalid session", 401);

    const userId = userData.user.id;

    const { data, error } = await supabaseAdmin
      .from("platform_accounts")
      .select("provider, created_at, updated_at, expiry")
      .eq("user_id", userId);

    if (error) return jsonError(error.message, 500);

    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (e: any) {
    console.error("GET /api/platform-accounts failed:", e?.message ?? e);
    return jsonError(e?.message ?? "Server error", 500);
  }
}
