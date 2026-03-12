import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function isAuthorized(req: Request) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  return process.env.SUPPORT_ADMIN_SECRET && secret === process.env.SUPPORT_ADMIN_SECRET;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status"); // optional filter

  let query = supabaseAdmin
    .from("support_tickets")
    .select("id, team_id, user_id, email, subject, description, type, status, reply_message, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data: tickets, error } = await query;

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, tickets: tickets ?? [] });
}
