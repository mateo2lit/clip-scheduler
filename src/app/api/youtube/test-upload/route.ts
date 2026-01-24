import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { uploadSupabaseVideoToYouTube } from "@/lib/youtubeUpload";

type Body = {
  uploadId: string;
  title?: string;
  description?: string;
  privacyStatus?: "private" | "unlisted" | "public";
};

export async function POST(req: Request) {
  try {
    // ✅ Get user from Authorization header (Supabase session JWT)
    const authHeader = req.headers.get("authorization");

    if (!authHeader) {
      return NextResponse.json(
        { error: "Missing Authorization header" },
        { status: 401 }
      );
    }

    // Supabase sends: Bearer <token>
    const token = authHeader.replace("Bearer ", "");

    // ✅ Verify user session token
    const { data: userData, error: userError } =
      await supabaseAdmin.auth.getUser(token);

    if (userError || !userData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = userData.user;

    const body = (await req.json()) as Body;

    if (!body?.uploadId) {
      return NextResponse.json({ error: "Missing uploadId" }, { status: 400 });
    }

    const privacyStatus = body.privacyStatus ?? "private";

    // ✅ Load upload row
    const { data: uploadRow, error: uploadErr } = await supabaseAdmin
      .from("uploads")
      .select("id, user_id, bucket, storage_path")
      .eq("id", body.uploadId)
      .eq("user_id", user.id)
      .single();

    if (uploadErr || !uploadRow) {
      return NextResponse.json(
        { error: `Upload not found: ${uploadErr?.message}` },
        { status: 404 }
      );
    }

    // ✅ Load YouTube platform account
    const { data: acct, error: acctErr } = await supabaseAdmin
      .from("platform_accounts")
      .select("id, refresh_token")
      .eq("user_id", user.id)
      .eq("provider", "youtube")
      .single();

    if (acctErr || !acct?.refresh_token) {
      return NextResponse.json(
        { error: "YouTube not connected" },
        { status: 400 }
      );
    }

    // ✅ Upload video to user's YouTube account
    const result = await uploadSupabaseVideoToYouTube({
      userId: user.id,
      platformAccountId: acct.id,
      refreshToken: acct.refresh_token,

      bucket: uploadRow.bucket,
      storagePath: uploadRow.storage_path,

      title: body.title ?? "Clip Scheduler Test Upload",
      description: body.description ?? "",
      privacyStatus,
    });

    return NextResponse.json({
      ok: true,
      youtubeVideoId: result.youtubeVideoId,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
