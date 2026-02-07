import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Verifies the user from their Supabase JWT, then uses supabaseAdmin to insert.
function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function getUserFromBearer(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  const url = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anon = mustEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const supa = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await supa.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}

export async function POST(req: Request) {
  try {
    const user = await getUserFromBearer(req);
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const bucket = typeof body.bucket === "string" ? body.bucket : null;
    const file_path = typeof body.file_path === "string" ? body.file_path : null;

    if (!bucket || !file_path) {
      return NextResponse.json(
        { ok: false, error: "Missing bucket or file_path" },
        { status: 400 }
      );
    }

    // Insert with service role (bypasses RLS)
    const { data, error } = await supabaseAdmin
      .from("uploads")
      .insert({
        user_id: user.id,
        bucket,
        file_path,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
