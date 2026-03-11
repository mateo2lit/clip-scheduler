import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendSupportTicketResolvedEmail } from "@/lib/email";

export const runtime = "nodejs";

const BASE_STYLE = `body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#050505;color:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}.card{max-width:460px;width:100%;padding:32px;border-radius:16px;background:#0b0b10;text-align:center;}h1{margin:0 0 12px;font-size:22px;}p{margin:0;color:#94a3b8;font-size:15px;line-height:1.6;}`;

function htmlResponse(status: number, title: string, body: string, accentColor = "rgba(255,255,255,0.1)") {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${BASE_STYLE}.card{border:1px solid ${accentColor};}</style></head><body><div class="card"><h1>${title}</h1><p>${body}</p></div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  const message = searchParams.get("message") ?? null;

  if (!process.env.SUPPORT_ADMIN_SECRET || secret !== process.env.SUPPORT_ADMIN_SECRET) {
    return htmlResponse(403, "Unauthorized", "Invalid or missing secret.", "rgba(248,113,113,0.25)");
  }

  const { data: ticket, error } = await supabaseAdmin
    .from("support_tickets")
    .select("id, email, subject, status")
    .eq("id", params.id)
    .single();

  if (error || !ticket) {
    return htmlResponse(404, "Not Found", "Ticket not found.");
  }

  if (ticket.status === "resolved") {
    return htmlResponse(200, "Already Resolved", "This ticket was already marked as resolved.", "rgba(52,211,153,0.2)");
  }

  const { error: updateError } = await supabaseAdmin
    .from("support_tickets")
    .update({
      status: "resolved",
      reply_message: message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id);

  if (updateError) {
    return htmlResponse(500, "Error", `Failed to update ticket: ${updateError.message}`, "rgba(248,113,113,0.25)");
  }

  sendSupportTicketResolvedEmail(ticket.email, ticket.subject, message).catch(() => {});

  const safeSubject = ticket.subject.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeEmail = ticket.email.replace(/</g, "&lt;");

  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>Ticket Resolved</title>
    <style>${BASE_STYLE}.card{border:1px solid rgba(52,211,153,0.2);}.badge{display:inline-block;background:rgba(16,185,129,0.16);border:1px solid rgba(16,185,129,0.35);color:#6ee7b7;font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;margin-bottom:16px;}.subject{color:#f8fafc;font-weight:600;}</style></head>
    <body><div class="card">
      <div class="badge">Resolved</div>
      <h1>Ticket resolved</h1>
      <p>Subject: <span class="subject">${safeSubject}</span><br/><br/>User notified at ${safeEmail}</p>
    </div></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
