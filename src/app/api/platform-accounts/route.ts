// src/app/api/platform-accounts/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export const runtime = "nodejs";

function extractToken(req: Request): string {
  const authHeader = req.headers.get("authorization") || "";
  return authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : "";
}

async function getUserId(token: string): Promise<{ userId?: string; error?: NextResponse }> {
  if (!token) {
    return { error: jsonError("Missing Authorization token", 401) };
  }
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user) {
    return { error: jsonError("Invalid session", 401) };
  }
  return { userId: userData.user.id };
}

export async function GET(req: Request) {
  try {
    const token = extractToken(req);
    const { userId, error } = await getUserId(token);
    if (error) return error;

    const { data, error: dbError } = await supabaseAdmin
      .from("platform_accounts")
      .select("provider, created_at, updated_at, expiry")
      .eq("user_id", userId);

    if (dbError) return jsonError(dbError.message, 500);

    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (e: any) {
    console.error("GET /api/platform-accounts failed:", e?.message ?? e);
    return jsonError(e?.message ?? "Server error", 500);
  }
}

export async function DELETE(req: Request) {
  try {
    const token = extractToken(req);
    const { userId, error } = await getUserId(token);
    if (error) return error;

    const url = new URL(req.url);
    const provider = url.searchParams.get("provider");

    if (!provider) {
      return jsonError("Missing provider query parameter", 400);
    }

    const { error: deleteError } = await supabaseAdmin
      .from("platform_accounts")
      .delete()
      .eq("user_id", userId)
      .eq("provider", provider.toLowerCase());

    if (deleteError) {
      return jsonError(deleteError.message, 500);
    }

    return NextResponse.json({ ok: true, message: `Disconnected ${provider}` });
  } catch (e: any) {
    console.error("DELETE /api/platform-accounts failed:", e?.message ?? e);
    return jsonError(e?.message ?? "Server error", 500);
  }
}
