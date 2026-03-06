import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const result = await getTeamContext(req);
  if (!result.ok) return result.error;
  const { teamId } = result.ctx;

  const { data } = await supabaseAdmin
    .from("teams")
    .select("onboarding_completed_at")
    .eq("id", teamId)
    .maybeSingle();

  return NextResponse.json({ ok: true, completed: !!data?.onboarding_completed_at });
}

export async function POST(req: Request) {
  const result = await getTeamContext(req);
  if (!result.ok) return result.error;
  const { teamId } = result.ctx;

  const body = await req.json().catch(() => ({}));
  const { role, platforms, challenge } = body;

  await supabaseAdmin
    .from("teams")
    .update({
      onboarding_data: { role, platforms, challenge },
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("id", teamId);

  return NextResponse.json({ ok: true });
}
