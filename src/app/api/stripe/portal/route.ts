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
      .select("stripe_customer_id")
      .eq("id", teamId)
      .single();

    if (!team?.stripe_customer_id) {
      return NextResponse.json({ error: "No subscription found" }, { status: 400 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const session = await getStripe().billingPortal.sessions.create({
      customer: team.stripe_customer_id,
      return_url: `${siteUrl}/settings`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("Stripe portal error:", err);
    return NextResponse.json({ error: "Failed to create portal session" }, { status: 500 });
  }
}
