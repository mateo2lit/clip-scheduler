import { NextRequest, NextResponse } from "next/server";
import { getTeamContext } from "@/lib/teamAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  const ctx = await getTeamContext(req);
  if (!ctx.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { uploadId, thumbnailPath } = await req.json();
  if (!uploadId || !thumbnailPath) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  // Verify this upload belongs to this user's team
  const { data: upload } = await supabaseAdmin
    .from("uploads")
    .select("id, team_id")
    .eq("id", uploadId)
    .eq("team_id", ctx.teamId)
    .maybeSingle();

  if (!upload) return NextResponse.json({ error: "Upload not found" }, { status: 404 });

  // Update uploads row
  await supabaseAdmin
    .from("uploads")
    .update({ thumbnail_path: thumbnailPath })
    .eq("id", uploadId);

  // Update all scheduled_posts for this upload
  await supabaseAdmin
    .from("scheduled_posts")
    .update({ thumbnail_path: thumbnailPath })
    .eq("upload_id", uploadId);

  return NextResponse.json({ ok: true });
}
