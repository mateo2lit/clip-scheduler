import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { refreshFacebookToken } from "@/lib/facebook";
import { refreshInstagramToken } from "@/lib/instagram";
import { refreshXTokens } from "@/lib/x";
import { refreshLinkedInToken } from "@/lib/linkedin";
import {
  refreshBlueskySession,
  resolveBlueskyPdsServiceUrl,
} from "@/lib/blueskyUpload";
import { sendReconnectEmail } from "@/lib/email";

const RECONNECT_EMAIL_THROTTLE_MS = 24 * 60 * 60 * 1000; // 24 hours

function isHardReconnectError(message: string): boolean {
  const m = (message || "").toLowerCase();
  return (
    m.includes("revoked") ||
    m.includes("expired") ||
    m.includes("invalid_token") ||
    m.includes("invalid_grant") ||
    m.includes("oauthexception") ||
    m.includes("needs to reconnect") ||
    m.includes("no usable") ||
    m.includes("401")
  );
}

async function maybeSendReconnectEmail(acct: {
  id: string;
  provider: string;
  team_id: string;
  last_reconnect_email_at?: string | null;
}) {
  // Throttle: skip if we emailed for this account within the last 24h.
  if (acct.last_reconnect_email_at) {
    const since = Date.now() - new Date(acct.last_reconnect_email_at).getTime();
    if (since < RECONNECT_EMAIL_THROTTLE_MS) return;
  }

  const { data: team } = await supabaseAdmin
    .from("teams")
    .select("owner_id")
    .eq("id", acct.team_id)
    .maybeSingle();

  const ownerId = team?.owner_id;
  if (!ownerId) return;

  const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(ownerId);
  const email = userRes?.user?.email;
  if (!email) return;

  const { data: prefs } = await supabaseAdmin
    .from("notification_preferences")
    .select("notify_reconnect")
    .eq("user_id", ownerId)
    .maybeSingle();

  if (prefs?.notify_reconnect === false) return; // explicitly opted out

  await sendReconnectEmail(email, acct.provider);

  await supabaseAdmin
    .from("platform_accounts")
    .update({ last_reconnect_email_at: new Date().toISOString() })
    .eq("id", acct.id);
}

export const runtime = "nodejs";

function requireWorkerAuth(req: Request) {
  const workerSecret = process.env.WORKER_SECRET;
  if (!workerSecret) throw new Error("WORKER_SECRET is not configured");

  const token = new URL(req.url).searchParams.get("token");
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  const provided = bearer || token || "";

  const cronSecret = process.env.CRON_SECRET;
  const valid = provided === workerSecret || (cronSecret && provided === cronSecret);
  if (!valid) throw new Error("Unauthorized worker request");
}

/**
 * Refresh Facebook, Instagram, X, LinkedIn, and Bluesky tokens.
 * Facebook/Instagram/X/LinkedIn refresh when expiry is within 7 days OR null/missing.
 * Bluesky refreshes on every run (atproto access JWTs expire in ~2 hours; refreshJwt
 * lasts ~90 days and is the only thing we can extend without a full reconnect).
 * Should run daily via GitHub Actions (.github/workflows/refresh-tokens.yml).
 */
async function runRefresh(req: Request) {
  requireWorkerAuth(req);

  const results: any[] = [];

  const sevenDaysFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000;

  const { data: accounts, error } = await supabaseAdmin
    .from("platform_accounts")
    .select(
      "id, provider, access_token, refresh_token, expiry, team_id, platform_user_id, last_reconnect_email_at"
    )
    .in("provider", ["facebook", "instagram", "x", "linkedin", "bluesky"])
    .order("expiry", { ascending: true, nullsFirst: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ ok: true, message: "No accounts to refresh", refreshed: 0, results: [] });
  }

  // Filter: Bluesky always refreshes; everyone else only when expiring soon or missing expiry.
  const due = accounts.filter((a) => {
    if (a.provider === "bluesky") return true;
    if (!a.expiry) return true;
    return new Date(a.expiry).getTime() < sevenDaysFromNow;
  });

  for (const acct of due) {
    try {
      let newToken: string;
      let newExpiry: string;

      if (acct.provider === "facebook") {
        const token = acct.access_token || acct.refresh_token;
        if (!token) throw new Error("No token to refresh");

        const refreshed = await refreshFacebookToken(token);
        newToken = refreshed.access_token;
        // Facebook's fb_exchange_token sometimes omits expires_in for already-long-lived
        // tokens; default to 60 days (the standard long-lived token lifetime).
        newExpiry = new Date(Date.now() + (refreshed.expires_in || 5184000) * 1000).toISOString();

        // Also refresh page access tokens by re-fetching pages
        const { getFacebookUserPages } = await import("@/lib/facebook");
        const pages = await getFacebookUserPages(newToken);

        const updateData: any = {
          access_token: newToken,
          refresh_token: newToken,
          expiry: newExpiry,
          updated_at: new Date().toISOString(),
        };

        // Update page token if we have pages
        if (pages.length > 0) {
          updateData.page_access_token = pages[0].access_token;
        }

        await supabaseAdmin
          .from("platform_accounts")
          .update(updateData)
          .eq("id", acct.id);
      } else if (acct.provider === "instagram") {
        const token = acct.access_token;
        if (!token) throw new Error("No token to refresh");

        const refreshed = await refreshInstagramToken(token);
        newToken = refreshed.access_token;
        newExpiry = new Date(Date.now() + (refreshed.expires_in || 5184000) * 1000).toISOString();

        await supabaseAdmin
          .from("platform_accounts")
          .update({
            access_token: newToken,
            refresh_token: newToken,
            expiry: newExpiry,
            updated_at: new Date().toISOString(),
          })
          .eq("id", acct.id);
      } else if (acct.provider === "x") {
        const token = acct.refresh_token;
        if (!token) throw new Error("No refresh_token to refresh");

        const refreshed = await refreshXTokens(token);
        const newXToken = refreshed.access_token;
        const newXExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

        await supabaseAdmin
          .from("platform_accounts")
          .update({
            access_token: newXToken,
            refresh_token: refreshed.refresh_token,
            expiry: newXExpiry,
            updated_at: new Date().toISOString(),
          })
          .eq("id", acct.id);
      } else if (acct.provider === "linkedin") {
        const refreshTokenStored = acct.refresh_token;
        if (!refreshTokenStored || refreshTokenStored === acct.access_token) {
          // Pre-fix accounts stored the access_token in the refresh_token slot.
          // The LinkedIn refresh endpoint will reject it; surface a clear reconnect signal.
          throw new Error(
            "No usable LinkedIn refresh_token on file — user needs to reconnect (or the LinkedIn app lacks the Refresh Tokens product)"
          );
        }

        const refreshed = await refreshLinkedInToken(refreshTokenStored);
        newToken = refreshed.access_token;
        newExpiry = new Date(Date.now() + (refreshed.expires_in || 5184000) * 1000).toISOString();

        await supabaseAdmin
          .from("platform_accounts")
          .update({
            access_token: newToken,
            // LinkedIn rotates refresh tokens; keep old one if a new one wasn't issued.
            refresh_token: refreshed.refresh_token || refreshTokenStored,
            expiry: newExpiry,
            updated_at: new Date().toISOString(),
          })
          .eq("id", acct.id);
      } else if (acct.provider === "bluesky") {
        const refreshJwt = acct.refresh_token;
        if (!refreshJwt) throw new Error("No Bluesky refreshJwt on file");

        const did = (acct as any).platform_user_id || "";
        const serviceUrl = did
          ? await resolveBlueskyPdsServiceUrl(did)
          : "https://bsky.social";

        const refreshed = await refreshBlueskySession(serviceUrl, refreshJwt);

        await supabaseAdmin
          .from("platform_accounts")
          .update({
            access_token: refreshed.accessJwt,
            refresh_token: refreshed.refreshJwt,
            // Bluesky doesn't expose a stable expiry; clear it so the next run picks this up again.
            updated_at: new Date().toISOString(),
          })
          .eq("id", acct.id);
      } else {
        continue;
      }

      // Successful refresh — clear any prior throttle timestamp so a future
      // re-break gets emailed promptly instead of being suppressed for 24h.
      if ((acct as any).last_reconnect_email_at) {
        await supabaseAdmin
          .from("platform_accounts")
          .update({ last_reconnect_email_at: null })
          .eq("id", acct.id);
      }

      results.push({ id: acct.id, provider: acct.provider, ok: true });
    } catch (e: any) {
      const message = e?.message || "Unknown error";
      results.push({ id: acct.id, provider: acct.provider, ok: false, error: message });

      if (isHardReconnectError(message)) {
        try {
          await maybeSendReconnectEmail({
            id: acct.id,
            provider: acct.provider,
            team_id: (acct as any).team_id,
            last_reconnect_email_at: (acct as any).last_reconnect_email_at,
          });
        } catch (mailErr) {
          console.error("Reconnect email dispatch failed:", mailErr);
        }
      }
    }
  }

  // ── 30-day storage cleanup safety net ───────────────────────────────────────
  // Deletes files for uploads where every scheduled_post is in a terminal state
  // and the latest scheduled_for is older than 30 days.
  // This catches files that were never cleaned up (e.g., a post that permanently failed).
  try {
    const DEFAULT_BUCKET = process.env.UPLOADS_BUCKET || "uploads";
    const thirtyDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: oldPosts } = await supabaseAdmin
      .from("scheduled_posts")
      .select("upload_id")
      .in("status", ["posted", "failed"])
      .lt("scheduled_for", thirtyDaysAgo)
      .not("upload_id", "is", null);

    if (oldPosts && oldPosts.length > 0) {
      const uploadIds = [...new Set(oldPosts.map((p: any) => p.upload_id))];

      for (const uploadId of uploadIds) {
        // Only delete if ALL posts for this upload are in terminal states
        const { data: allPosts } = await supabaseAdmin
          .from("scheduled_posts")
          .select("status")
          .eq("upload_id", uploadId);

        if (!allPosts || !allPosts.every((p: any) => ["posted", "failed"].includes(p.status))) {
          continue;
        }

        const { data: upload } = await supabaseAdmin
          .from("uploads")
          .select("bucket, file_path, storage_path, path, object_path")
          .eq("id", uploadId)
          .maybeSingle();

        if (!upload) continue;

        const pathCol = ["file_path", "storage_path", "path", "object_path"].find(
          (k) => typeof (upload as any)[k] === "string" && (upload as any)[k].trim()
        );
        if (!pathCol) continue;

        const storagePath = (upload as any)[pathCol];
        const bucket = (upload as any).bucket?.trim() || DEFAULT_BUCKET;

        try {
          await supabaseAdmin.storage.from(bucket).remove([storagePath]);
          await supabaseAdmin.from("uploads").update({ storage_deleted: true }).eq("id", uploadId);
        } catch {
          // Non-fatal
        }
      }
    }
  } catch {
    // Non-fatal — don't let cleanup failure affect the token refresh response
  }

  return NextResponse.json({
    ok: true,
    refreshed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}

export async function POST(req: Request) {
  try {
    return await runRefresh(req);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    return await runRefresh(req);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
