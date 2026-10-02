import { getTeamContext, requireOwnerOrAdmin } from "@/lib/teamAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getYouTubeApi, getYouTubeOAuthClient } from "@/lib/youtube";
import { verifyYouTubeIdentity, youtubeFeatureEnabled } from "@/lib/youtubeIdentity";
import { connectionJson } from "@/lib/youtubeConnection";

export const runtime = "nodejs";
export async function POST(req: Request) {
  const auth = await getTeamContext(req);
  if (!auth.ok) return auth.error;
  const denied = requireOwnerOrAdmin(auth.ctx.role);
  if (denied) return denied;
  if (!youtubeFeatureEnabled("CONFIRMATION", auth.ctx.teamId)) return connectionJson({ ok: false, error: "Channel refresh is not enabled yet" }, 404);
  try {
    const { accountId } = await req.json();
    const { data: account, error } = await supabaseAdmin.from("platform_accounts").select("id, refresh_token, platform_user_id")
      .eq("id", accountId).eq("team_id", auth.ctx.teamId).eq("provider", "youtube").maybeSingle();
    if (error || !account) return connectionJson({ ok: false, error: "Account not found" }, 404);
    // Atomic throttle also bounds repeated failures; no tokens are stored in metadata.
    const { data: allowed, error: throttleError } = await supabaseAdmin.rpc("claim_youtube_identity_refresh", { p_account_id: account.id });
    if (throttleError) throw new Error("Refresh unavailable");
    if (!allowed) return connectionJson({ ok: false, error: "Please wait a minute before refreshing again" }, 429);
    const oauth = await getYouTubeOAuthClient({ refreshToken: account.refresh_token });
    const identity = await verifyYouTubeIdentity(getYouTubeApi(oauth), account.platform_user_id);
    const { error: saveError } = await supabaseAdmin.from("youtube_account_identity").upsert({ platform_account_id: account.id,
      title: identity.title, custom_url: identity.customUrl, avatar_url: identity.avatarUrl, verified_at: new Date().toISOString() });
    if (saveError) throw new Error("Save failed");
    return connectionJson({ ok: true, identity });
  } catch {
    return connectionJson({ ok: false, error: "Unable to verify this channel. Try again later or reconnect the intended channel." }, 503);
  }
}
