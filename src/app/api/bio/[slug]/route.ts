import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolvePostPermalink, resolveThumbnailUrl, normalizeExternalUrl } from "@/lib/bioHelpers";

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
        .limit(81); // over-fetch to get 9 unique groups (worst case: 9 platforms each)

      // Deduplicate by group_id (or upload_id as fallback) — one entry per upload session
      const seen = new Set<string>();
      const unique: any[] = [];
      for (const p of posts || []) {
        const key = p.group_id || p.upload_id || p.id;
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(p);
          if (unique.length >= 9) break;
        }
      }

      recentPosts = unique.map((p: any) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        provider: p.provider,
        thumbnail_url: resolveThumbnailUrl(p.thumbnail_path),
        permalink: resolvePostPermalink(p.provider, p.platform_post_id, p.platform_accounts),
        posted_at: p.posted_at,
      }));
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
