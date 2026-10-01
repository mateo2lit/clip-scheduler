import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext, requireOwner } from "@/lib/teamAuth";
import { getStripe } from "@/lib/stripe";

export async function POST(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;

    const { teamId, role } = result.ctx;
    const ownerCheck = requireOwner(role);
    if (ownerCheck) return ownerCheck;

    const { data: team } = await supabaseAdmin
      .from("teams")
      .select("stripe_customer_id, stripe_subscription_id")
      .eq("id", teamId)
      .single();

    if (!team?.stripe_customer_id) {
      return NextResponse.json({ error: "No subscription found" }, { status: 400 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const body = await req.json().catch(() => ({}));
    const base = { customer: team.stripe_customer_id, return_url: `${siteUrl}/settings` };

    // { flow: "change_plan" } opens the portal straight on the plan picker. That needs
    // "Customers can switch plans" enabled in Stripe's portal settings; if it isn't (or
    // there's no subscription), fall back to the portal's home page.
    if (body?.flow === "change_plan" && team.stripe_subscription_id) {
      try {
        const session = await getStripe().billingPortal.sessions.create({
          ...base,
          flow_data: {
            type: "subscription_update",
            subscription_update: { subscription: team.stripe_subscription_id },
            after_completion: { type: "redirect", redirect: { return_url: `${siteUrl}/settings?upgraded=1` } },
          },
        });
        return NextResponse.json({ url: session.url });
      } catch (e: any) {
        console.error("Stripe plan-change portal unavailable, opening portal home:", e?.message);
      }
    }

    const session = await getStripe().billingPortal.sessions.create(base);

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("Stripe portal error:", err);
    return NextResponse.json({ error: "Failed to create portal session" }, { status: 500 });
  }
}
