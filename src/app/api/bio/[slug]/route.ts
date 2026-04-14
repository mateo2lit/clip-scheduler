import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

    // Get recent posts if enabled
    let recentPosts: any[] = [];
    if (page.show_recent_posts) {
      const { data: posts } = await supabaseAdmin
        .from("scheduled_posts")
        .select("id, title, description, provider, platform_post_id, thumbnail_path, posted_at")
        .eq("team_id", page.team_id)
        .eq("status", "posted")
        .order("posted_at", { ascending: false })
        .limit(9);
      recentPosts = posts || [];
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
      links: links || [],
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
