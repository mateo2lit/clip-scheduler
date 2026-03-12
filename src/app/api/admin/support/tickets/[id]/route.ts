import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendSupportTicketResolvedEmail } from "@/lib/email";

export const runtime = "nodejs";

function isAuthorized(req: Request) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  return process.env.SUPPORT_ADMIN_SECRET && secret === process.env.SUPPORT_ADMIN_SECRET;
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const { status, reply_message, notify } = body ?? {};

  const { data: ticket, error: fetchError } = await supabaseAdmin
    .from("support_tickets")
    .select("id, email, subject")
    .eq("id", params.id)
    .single();

  if (fetchError || !ticket) {
    return NextResponse.json({ ok: false, error: "Ticket not found" }, { status: 404 });
  }

  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (status) updates.status = status;
  if (reply_message !== undefined) updates.reply_message = reply_message;

  const { error: updateError } = await supabaseAdmin
    .from("support_tickets")
    .update(updates)
    .eq("id", params.id);

  if (updateError) {
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  if (notify && status === "resolved") {
    sendSupportTicketResolvedEmail(ticket.email, ticket.subject, reply_message ?? null).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
