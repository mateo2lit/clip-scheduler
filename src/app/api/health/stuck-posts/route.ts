import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendStuckPostsAlertEmail } from "@/lib/email";
import { summarizeStuckPosts, STUCK_AFTER_MINUTES, ALERT_EVERY_HOURS } from "@/lib/stuckPosts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Called every 10 minutes by the Supabase cron job `clipdash-stuck-posts-check`
// (docs/supabase-cron.sql). It needs no secret on purpose: on 2026-10-17 a bad WORKER_SECRET
// stopped every post for two days, and a check behind that same secret would have gone quiet too.
// Being public, it answers with counts only, and the system_alerts row limits email to one per window.

const ALERT_KEY = "stuck_posts";

export async function GET() {
  const now = Date.now();
  const cutoff = new Date(now - STUCK_AFTER_MINUTES * 60_000).toISOString();

  const [due, rendering] = await Promise.all([
    supabaseAdmin
      .from("scheduled_posts")
      .select("scheduled_for, upload_id")
      .eq("status", "scheduled")
      .lt("scheduled_for", cutoff)
      .order("scheduled_for", { ascending: true })
      .limit(1000),
    supabaseAdmin.from("uploads").select("id").eq("render_status", "rendering").limit(500),
  ]);

  if (due.error) {
    return NextResponse.json({ ok: false, error: "Could not read scheduled posts" }, { status: 500 });
  }

  const renderingIds = new Set<string>((rendering.data ?? []).map((u: { id: string }) => u.id));
  const { count, oldestMinutes } = summarizeStuckPosts(due.data ?? [], renderingIds, now);

  if (count === 0) {
    return NextResponse.json({ ok: true, stuck: 0, oldest_minutes: 0, alerted: false });
  }

  // Claim the alert window in one conditional update, so overlapping calls send one email.
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from("system_alerts")
    .update({ last_sent_at: new Date(now).toISOString() })
    .eq("key", ALERT_KEY)
    .lt("last_sent_at", new Date(now - ALERT_EVERY_HOURS * 60 * 60_000).toISOString())
    .select("key");

  if (claimError) {
    // Without the throttle row every run would email; stay quiet and say why instead.
    console.error("[stuck-posts] can't throttle alerts:", claimError.message);
    return NextResponse.json(
      { ok: false, stuck: count, oldest_minutes: oldestMinutes, alerted: false, alert_error: claimError.message },
      { status: 503 }
    );
  }

  const alerted = (claimed ?? []).length > 0;
  if (alerted) await sendStuckPostsAlertEmail(count, oldestMinutes);

  return NextResponse.json({ ok: false, stuck: count, oldest_minutes: oldestMinutes, alerted }, { status: 503 });
}
