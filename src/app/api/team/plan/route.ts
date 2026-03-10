import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";
import { getStripe } from "@/lib/stripe";

export async function GET(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;

    const { teamId } = result.ctx;

    const [teamResult, postsResult] = await Promise.all([
      supabaseAdmin
        .from("teams")
        .select("plan, plan_status, trial_ends_at, stripe_subscription_id")
        .eq("id", teamId)
        .single(),
      supabaseAdmin
        .from("scheduled_posts")
        .select("id", { count: "exact", head: true })
        .eq("team_id", teamId)
        .eq("status", "posted"),
    ]);

    if (teamResult.error || !teamResult.data) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    const team = teamResult.data;
    const postedCount = postsResult.count ?? 0;

    let currentPeriodEnd: string | null = null;
    if (team.stripe_subscription_id) {
      try {
        const stripe = getStripe();
        const sub = await stripe.subscriptions.retrieve(team.stripe_subscription_id);
        currentPeriodEnd = new Date((sub as any).current_period_end * 1000).toISOString();
      } catch {
        // non-critical — omit renewal date if Stripe call fails
      }
    }

    return NextResponse.json({
      ok: true,
      plan: team.plan || "none",
      plan_status: team.plan_status || "inactive",
      trial_ends_at: team.trial_ends_at || null,
      current_period_end: currentPeriodEnd,
      posted_count: postedCount,
    });
  } catch (err: any) {
    console.error("GET /api/team/plan error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
