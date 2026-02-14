import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  const expected = process.env.WORKER_SECRET;
  if (expected && token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find the first Instagram platform account
  const { data: acct, error: acctErr } = await supabaseAdmin
    .from("platform_accounts")
    .select("id, team_id, ig_user_id, platform_user_id, access_token, profile_name")
    .eq("provider", "instagram")
    .limit(1)
    .maybeSingle();

  if (acctErr || !acct) {
    return NextResponse.json({ error: "No Instagram account found", detail: acctErr?.message });
  }

  // Call GET /me with the stored token
  let meData: any = null;
  let meError: string | null = null;
  try {
    const res = await fetch(
      `https://graph.instagram.com/v21.0/me?fields=id,user_id,username,account_type,media_count&access_token=${encodeURIComponent(acct.access_token)}`
    );
    meData = await res.json();
    if (!res.ok) meError = `HTTP ${res.status}`;
  } catch (e: any) {
    meError = e?.message;
  }

  return NextResponse.json({
    stored: {
      ig_user_id: acct.ig_user_id,
      platform_user_id: acct.platform_user_id,
      profile_name: acct.profile_name,
    },
    graph_api_me: meData,
    graph_api_error: meError,
  });
}
