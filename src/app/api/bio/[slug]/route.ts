import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  resolvePostPermalink,
  resolveThumbnailUrl,
  resolvePlatformThumbnail,
  normalizeExternalUrl,
} from "@/lib/bioHelpers";

export const runtime = "nodejs";

// Public endpoint - no auth required
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  try {
    const { slug } = params;

    const { data: page } = await supabaseAdmin
      .from("bio_pages")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();

    if (!page) {
      return NextResponse.json({ ok: false, error: "Page not found" }, { status: 404 });
    }

    const { data: links } = await supabaseAdmin
      .from("bio_links")
      .select("id, title, url, icon, sort_order, clicks")
      .eq("bio_page_id", page.id)
      .order("sort_order", { ascending: true });

    // Normalize link URLs (ensure https:// prefix) — safety net in case data was saved without it
    const normalizedLinks = (links || []).map((l) => ({
      ...l,
      url: normalizeExternalUrl(l.url),
    }));

    // Get recent posts if enabled
    let recentPosts: any[] = [];
    if (page.show_recent_posts) {
      const { data: posts } = await supabaseAdmin
        .from("scheduled_posts")
        .select("id, title, description, provider, platform_post_id, thumbnail_path, posted_at, group_id, upload_id, platform_accounts!inner(profile_name,platform_user_id)")
        .eq("team_id", page.team_id)
        .eq("status", "posted")
        .order("posted_at", { ascending: false })
        .limit(120); // over-fetch so every sibling of the newest 9 groups is present

      // Group by group_id (or upload_id as fallback) — one tile per upload session.
      // Order is preserved from the query, so `order` is newest-first.
      const order: string[] = [];
      const groups = new Map<string, any[]>();
      for (const p of posts || []) {
        const key = p.group_id || p.upload_id || p.id;
        if (!groups.has(key)) {
          groups.set(key, []);
          order.push(key);
        }
        groups.get(key)!.push(p);
      }

      recentPosts = order.slice(0, 9).map((key) => {
        const rows = groups.get(key)!;
        const newest = rows[0];

        // A group is one video posted to several platforms, and only some of those
        // rows can produce an image: a stored thumbnail beats a platform-CDN one,
        // and either beats nothing. Picking the first row per group (the old
        // behaviour) meant a Bluesky or LinkedIn sibling could hide a YouTube
        // thumbnail that was sitting right there.
        let imageRow: any = null;
        let thumbnailUrl: string | null = null;
        let bestRank = 3;

        for (const r of rows) {
          const stored = resolveThumbnailUrl(r.thumbnail_path);
          const derived = resolvePlatformThumbnail(r.provider, r.platform_post_id);
          const rank = stored ? 0 : derived ? 1 : 3;
          if (rank < bestRank) {
            bestRank = rank;
            imageRow = r;
            thumbnailUrl = stored ?? derived;
            if (rank === 0) break;
          }
        }

        // Link to the platform whose thumbnail we're showing when we can, so the
        // badge and the destination agree; otherwise take the first row that
        // resolves to anything linkable.
        const linkRow =
          [imageRow, ...rows].find(
            (r) => r && resolvePostPermalink(r.provider, r.platform_post_id, r.platform_accounts)
          ) ?? newest;

        return {
          id: newest.id,
          title: newest.title,
          description: newest.description,
          provider: (imageRow ?? linkRow ?? newest).provider,
          thumbnail_url: thumbnailUrl,
          permalink: resolvePostPermalink(linkRow.provider, linkRow.platform_post_id, linkRow.platform_accounts),
          posted_at: newest.posted_at,
        };
      });
    }

    return NextResponse.json({
      ok: true,
      page: {
        display_name: page.display_name,
        bio: page.bio,
        avatar_url: page.avatar_url,
        theme: page.theme,
        accent_color: page.accent_color,
        show_recent_posts: page.show_recent_posts,
      },
      links: normalizedLinks,
      recentPosts,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}

// Track link clicks
export async function POST(req: Request, { params }: { params: { slug: string } }) {
  try {
    const body = await req.json();
    const { linkId } = body;

    if (!linkId) {
      return NextResponse.json({ ok: false, error: "Missing linkId" }, { status: 400 });
    }

    // Record click
    await supabaseAdmin.from("bio_link_clicks").insert({
      bio_link_id: linkId,
      referrer: req.headers.get("referer") || null,
    });

    // Increment click count via raw SQL increment
    await supabaseAdmin
      .from("bio_links")
      .update({ clicks: (await supabaseAdmin.from("bio_links").select("clicks").eq("id", linkId).single()).data?.clicks + 1 || 1 })
      .eq("id", linkId);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true }); // Don't fail on tracking errors
  }
}
