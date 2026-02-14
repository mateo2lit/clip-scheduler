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

    const body = await req.json().catch(() => ({}));
    const { priceId } = body;

    if (!priceId) {
      return NextResponse.json({ error: "Missing priceId" }, { status: 400 });
    }

    // Get team to check for existing Stripe customer
    const { data: team } = await supabaseAdmin
      .from("teams")
      .select("stripe_customer_id, plan_status")
      .eq("id", teamId)
      .single();

    let customerId = team?.stripe_customer_id;

    if (!customerId) {
      // Look up team owner email for customer creation
      const { data: owner } = await supabaseAdmin
        .from("team_members")
        .select("user_id")
        .eq("team_id", teamId)
        .eq("role", "owner")
        .single();

      let email: string | undefined;
      if (owner) {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(owner.user_id);
        email = userData?.user?.email ?? undefined;
      }

      const customer = await getStripe().customers.create({
        email,
        metadata: { team_id: teamId },
      });
      customerId = customer.id;

      await supabaseAdmin
        .from("teams")
        .update({ stripe_customer_id: customerId })
        .eq("id", teamId);
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { trial_period_days: 7 },
      success_url: `${siteUrl}/settings?checkout=success`,
      cancel_url: `${siteUrl}/settings?checkout=canceled`,
      metadata: { team_id: teamId },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("Stripe checkout error:", err);
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  }
}
