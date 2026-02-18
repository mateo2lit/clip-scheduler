import { NextResponse } from "next/server";

export const runtime = "nodejs";

const VERIFY_TOKEN = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;

/**
 * GET — Meta webhook verification (hub.challenge handshake)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return new Response(challenge || "", { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/**
 * POST — Receive webhook events from Instagram
 * For now, just log and acknowledge. Build out processing later for analytics.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    // TODO: Process webhook events for analytics (comments, mentions, insights, etc.)
    console.log("[Instagram Webhook]", JSON.stringify(body));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
