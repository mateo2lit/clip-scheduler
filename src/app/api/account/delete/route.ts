import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";
import { getStripe } from "@/lib/stripe";

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
      // Cancel Stripe subscription before deleting team row (otherwise user keeps getting billed)
      const { data: team } = await supabaseAdmin
        .from("teams")
        .select("stripe_subscription_id")
        .eq("id", teamId)
        .single();

      if (team?.stripe_subscription_id) {
        try {
          await getStripe().subscriptions.cancel(team.stripe_subscription_id);
        } catch (stripeErr: any) {
          // Log but don't block deletion — subscription may already be cancelled
          console.error(
            "[Account Delete] Stripe cancellation failed — MANUAL ACTION REQUIRED.",
            "subscription_id:", team.stripe_subscription_id,
            "error:", stripeErr?.message
          );
        }
      } else {
        console.warn("[Account Delete] No stripe_subscription_id on team — subscription not cancelled. team_id:", teamId);
      }

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

function base64UrlDecode(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/** True when `sig` is the HMAC-SHA256 of `payload` under `secret` (Meta's signed_request scheme). */
function signatureMatches(sig: string, payload: string, secret: string | undefined): boolean {
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(payload).digest();
  const given = base64UrlDecode(sig);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * POST handler — Meta's data deletion callback.
 *
 * When someone removes Clip Dash in their Facebook or Instagram settings and asks for
 * their data to be deleted, Meta POSTs a form field `signed_request` here. We verify it
 * was signed with our Facebook or Instagram app secret, delete that person's connections
 * from that app, and reply with a status URL and confirmation code as Meta requires.
 */
export async function POST(req: Request) {
  try {
    // Meta sends application/x-www-form-urlencoded; accept JSON too for manual testing.
    const raw = await req.text();
    let signedRequest: string | null = new URLSearchParams(raw).get("signed_request");
    if (!signedRequest) {
      try {
        signedRequest = JSON.parse(raw)?.signed_request ?? null;
      } catch {
        // Not JSON either
      }
    }
    if (!signedRequest) {
      return NextResponse.json({ ok: false, error: "Missing signed_request" }, { status: 400 });
    }

    const [sig, encodedPayload] = signedRequest.split(".");
    if (!sig || !encodedPayload) {
      return NextResponse.json({ ok: false, error: "Invalid signed_request format" }, { status: 400 });
    }

    const fromFacebook = signatureMatches(sig, encodedPayload, process.env.FACEBOOK_APP_SECRET);
    const fromInstagram = signatureMatches(sig, encodedPayload, process.env.INSTAGRAM_APP_SECRET);
    if (!fromFacebook && !fromInstagram) {
      return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 403 });
    }

    let payload: any;
    try {
      payload = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8"));
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid signed_request payload" }, { status: 400 });
    }
    if (payload?.algorithm && String(payload.algorithm).toUpperCase() !== "HMAC-SHA256") {
      return NextResponse.json({ ok: false, error: "Unsupported algorithm" }, { status: 400 });
    }

    const metaUserId = String(payload?.user_id ?? "");
    if (!/^\d+$/.test(metaUserId)) {
      return NextResponse.json({ ok: false, error: "No user_id in signed request" }, { status: 400 });
    }

    // Delete only the connections that came from the app that signed the request.
    // Instagram rows made before meta_user_id existed are matched by their Instagram ID.
    if (fromFacebook) {
      await supabaseAdmin.from("platform_accounts").delete()
        .eq("provider", "facebook").eq("meta_user_id", metaUserId);
    }
    if (fromInstagram) {
      await supabaseAdmin.from("platform_accounts").delete()
        .eq("provider", "instagram").eq("meta_user_id", metaUserId);
      await supabaseAdmin.from("platform_accounts").delete()
        .eq("provider", "instagram").eq("ig_user_id", metaUserId);
    }

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
    console.error("[Meta data deletion] Error:", e?.message);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
