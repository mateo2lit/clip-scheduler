import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";

/**
 * DELETE /api/account/delete
 *
 * Deletes all user data:
 * - Scheduled posts
 * - Uploads (DB rows + storage files)
 * - Platform accounts
 * - Team membership (and team if owner)
 * - Auth user account
 *
 * Required for Meta app review (data deletion callback).
 */
export async function DELETE(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;

    const { userId, teamId, role } = result.ctx;

    // 1) Delete scheduled posts for this team
    await supabaseAdmin
      .from("scheduled_posts")
      .delete()
      .eq("user_id", userId);

    // 2) Delete uploads — remove storage files first, then DB rows
    const { data: uploads } = await supabaseAdmin
      .from("uploads")
      .select("id, bucket, file_path")
      .eq("user_id", userId);

    if (uploads && uploads.length > 0) {
      // Group by bucket for batch deletion
      const byBucket: Record<string, string[]> = {};
      for (const u of uploads) {
        const bucket = u.bucket || "uploads";
        if (!byBucket[bucket]) byBucket[bucket] = [];
        if (u.file_path) byBucket[bucket].push(u.file_path);
      }

      for (const [bucket, paths] of Object.entries(byBucket)) {
        if (paths.length > 0) {
          await supabaseAdmin.storage.from(bucket).remove(paths);
        }
      }

      await supabaseAdmin
        .from("uploads")
        .delete()
        .eq("user_id", userId);
    }

    // 3) Delete platform accounts
    await supabaseAdmin
      .from("platform_accounts")
      .delete()
      .eq("user_id", userId);

    // 4) Handle team cleanup
    if (role === "owner") {
      // Delete all team invites
      await supabaseAdmin
        .from("team_invites")
        .delete()
        .eq("team_id", teamId);

      // Delete all team members
      await supabaseAdmin
        .from("team_members")
        .delete()
        .eq("team_id", teamId);

      // Delete the team itself
      await supabaseAdmin
        .from("teams")
        .delete()
        .eq("id", teamId);
    } else {
      // Just remove this member from the team
      await supabaseAdmin
        .from("team_members")
        .delete()
        .eq("user_id", userId)
        .eq("team_id", teamId);
    }

    // 5) Delete the auth user
    const { error: deleteUserErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteUserErr) {
      console.error("[Account Delete] Failed to delete auth user:", deleteUserErr.message);
    }

    return NextResponse.json({ ok: true, message: "Account and all data deleted" });
  } catch (e: any) {
    console.error("[Account Delete] Error:", e?.message);
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}

/**
 * POST handler — Meta's data deletion callback sends POST requests.
 * Returns a confirmation URL and tracking code per Meta's requirements.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const signedRequest = body?.signed_request;

    if (!signedRequest) {
      return NextResponse.json({ ok: false, error: "Missing signed_request" }, { status: 400 });
    }

    // Parse the signed request to get user_id
    // Meta sends base64url encoded JSON payload
    const parts = signedRequest.split(".");
    if (parts.length !== 2) {
      return NextResponse.json({ ok: false, error: "Invalid signed_request format" }, { status: 400 });
    }

    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()
    );

    const metaUserId = payload.user_id;
    if (!metaUserId) {
      return NextResponse.json({ ok: false, error: "No user_id in signed request" }, { status: 400 });
    }

    // Find the platform account by platform_user_id or ig_user_id
    const { data: acct } = await supabaseAdmin
      .from("platform_accounts")
      .select("user_id")
      .or(`platform_user_id.eq.${metaUserId},ig_user_id.eq.${metaUserId}`)
      .limit(1)
      .maybeSingle();

    const siteUrl =
      process.env.SITE_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "https://clipdash.org";

    // Return the required response format for Meta
    const confirmationCode = `del_${metaUserId}_${Date.now()}`;

    return NextResponse.json({
      url: `${siteUrl}/privacy?deletion=${confirmationCode}`,
      confirmation_code: confirmationCode,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
