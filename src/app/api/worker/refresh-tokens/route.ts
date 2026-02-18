import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { refreshFacebookToken } from "@/lib/facebook";
import { refreshInstagramToken } from "@/lib/instagram";

export const runtime = "nodejs";

function requireWorkerAuth(req: Request) {
  const expected = process.env.WORKER_SECRET;
  if (!expected) throw new Error("WORKER_SECRET is not configured");

  const token = new URL(req.url).searchParams.get("token");
  if (token !== expected) {
    throw new Error("Unauthorized worker request");
  }
}

/**
 * Refresh Facebook and Instagram tokens that expire within 7 days.
 * Should run daily via Vercel cron.
 */
async function runRefresh(req: Request) {
  requireWorkerAuth(req);

  const results: any[] = [];

  // Find accounts with tokens expiring in the next 7 days
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: accounts, error } = await supabaseAdmin
    .from("platform_accounts")
    .select("id, provider, access_token, refresh_token, expiry, team_id")
    .in("provider", ["facebook", "instagram"])
    .lt("expiry", sevenDaysFromNow)
    .order("expiry", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ ok: true, message: "No tokens need refreshing", refreshed: 0, results: [] });
  }

  for (const acct of accounts) {
    try {
      let newToken: string;
      let newExpiry: string;

      if (acct.provider === "facebook") {
        const token = acct.access_token || acct.refresh_token;
        if (!token) throw new Error("No token to refresh");

        const refreshed = await refreshFacebookToken(token);
        newToken = refreshed.access_token;
        newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

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
        newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

        await supabaseAdmin
          .from("platform_accounts")
          .update({
            access_token: newToken,
            refresh_token: newToken,
            expiry: newExpiry,
            updated_at: new Date().toISOString(),
          })
          .eq("id", acct.id);
      } else {
        continue;
      }

      results.push({ id: acct.id, provider: acct.provider, ok: true });
    } catch (e: any) {
      results.push({ id: acct.id, provider: acct.provider, ok: false, error: e?.message });
    }
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
