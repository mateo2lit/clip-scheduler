import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";
import {
  sendSupportTicketUserEmail,
  sendSupportTicketAdminEmail,
} from "@/lib/email";

export const runtime = "nodejs";

const VALID_TYPES = ["bug", "question", "billing", "feature"] as const;

export async function GET(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;

    const { teamId } = result.ctx;

    const { data: tickets, error } = await supabaseAdmin
      .from("support_tickets")
      .select(
        "id, subject, type, status, description, reply_message, created_at, updated_at"
      )
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ ok: true, tickets: tickets ?? [] });
  } catch (e: any) {
    console.error("GET /api/support/tickets failed:", e?.message ?? e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;

    const { userId, teamId } = result.ctx;

    const body = await req.json();
    const { subject, description, type } = body ?? {};

    if (!subject || typeof subject !== "string" || subject.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: "Subject is required" },
        { status: 400 }
      );
    }
    if (subject.trim().length > 200) {
      return NextResponse.json(
        { ok: false, error: "Subject must be 200 characters or fewer" },
        { status: 400 }
      );
    }
    if (
      !description ||
      typeof description !== "string" ||
      description.trim().length === 0
    ) {
      return NextResponse.json(
        { ok: false, error: "Description is required" },
        { status: 400 }
      );
    }
    if (description.trim().length > 5000) {
      return NextResponse.json(
        { ok: false, error: "Description must be 5000 characters or fewer" },
        { status: 400 }
      );
    }
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { ok: false, error: "Invalid ticket type" },
        { status: 400 }
      );
    }

    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(
      userId
    );
    const email = userData?.user?.email ?? "";

    const { data: ticket, error } = await supabaseAdmin
      .from("support_tickets")
      .insert({
        team_id: teamId,
        user_id: userId,
        email,
        subject: subject.trim(),
        description: description.trim(),
        type,
        status: "open",
      })
      .select("id, subject, type, status, created_at")
      .single();

    if (error) throw error;

    // Fire-and-forget emails
    if (email) {
      sendSupportTicketUserEmail(email, ticket.subject, ticket.id).catch(
        () => {}
      );
    }
    sendSupportTicketAdminEmail(
      ticket.subject,
      description.trim(),
      type,
      email,
      ticket.id
    ).catch(() => {});

    return NextResponse.json({ ok: true, ticket });
  } catch (e: any) {
    console.error("POST /api/support/tickets failed:", e?.message ?? e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
