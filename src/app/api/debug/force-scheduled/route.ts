import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function requireAuth(req: Request) {
  const expected = process.env.WORKER_SECRET;
  if (!expected) return;
  const token = new URL(req.url).searchParams.get("token");
  if (token !== expected) throw new Error("Unauthorized");
}

export async function POST(req: Request) {
  try {
    requireAuth(req);

    const body = await req.json().catch(() => ({}));
    const postId = body?.postId as string | undefined;

    if (!postId) {
      return NextResponse.json({ ok: false, error: "Missing postId" }, { status: 400 });
    }

    // Hard-set to eligible
    const { error } = await supabaseAdmin
      .from("scheduled_posts")
      .update({
        user_id: "0540ab09-b46c-4bcd-9869-cfbb8f3fb536",
        provider: "youtube",
        status: "scheduled",
        scheduled_for: new Date(Date.now() - 60_000).toISOString(),
        last_error: null,
      })
      .eq("id", postId);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, postId });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
  }
}
