import { NextRequest, NextResponse } from "next/server";
import { getTeamContext } from "@/lib/teamAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  const result = await getTeamContext(req);
  if (!result.ok) return result.error;

  const { userId: _userId, teamId } = result.ctx;

  const { uploadId, thumbnailPath } = await req.json();
  if (!uploadId || !thumbnailPath) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  // Verify this upload belongs to this user's team
  const { data: upload } = await supabaseAdmin
    .from("uploads")
    .select("id, team_id")
    .eq("id", uploadId)
    .eq("team_id", teamId)
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
