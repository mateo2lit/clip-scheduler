import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";

// GET - fetch bio page for the authenticated user's team
export async function GET(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;

    const { data: page } = await supabaseAdmin
      .from("bio_pages")
      .select("*")
      .eq("team_id", result.ctx.teamId)
      .maybeSingle();

    if (!page) {
      return NextResponse.json({ ok: true, page: null, links: [] });
    }

    const { data: links } = await supabaseAdmin
      .from("bio_links")
      .select("*")
      .eq("bio_page_id", page.id)
      .order("sort_order", { ascending: true });

    return NextResponse.json({ ok: true, page, links: links || [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}

// POST - create or update bio page
export async function POST(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;

    const body = await req.json();
    const { slug, display_name, bio, avatar_url, theme, accent_color, show_recent_posts, links } = body;

    if (!slug || !/^[a-z0-9_-]{3,30}$/.test(slug)) {
      return NextResponse.json(
        { ok: false, error: "Slug must be 3-30 characters, lowercase letters, numbers, hyphens, or underscores" },
        { status: 400 }
      );
    }

    // Check slug uniqueness (excluding own team)
    const { data: existing } = await supabaseAdmin
      .from("bio_pages")
      .select("id, team_id")
      .eq("slug", slug)
      .maybeSingle();

    if (existing && existing.team_id !== result.ctx.teamId) {
      return NextResponse.json({ ok: false, error: "This URL is already taken" }, { status: 409 });
    }

    // Upsert bio page
    const pageData = {
      team_id: result.ctx.teamId,
      slug,
      display_name: display_name || "",
      bio: bio || "",
      avatar_url: avatar_url || null,
      theme: theme || "dark",
      accent_color: accent_color || "#8b5cf6",
      show_recent_posts: show_recent_posts !== false,
      updated_at: new Date().toISOString(),
    };

    let pageId: string;

    if (existing && existing.team_id === result.ctx.teamId) {
      await supabaseAdmin
        .from("bio_pages")
        .update(pageData)
        .eq("id", existing.id);
      pageId = existing.id;
    } else {
      const { data: created, error: createErr } = await supabaseAdmin
        .from("bio_pages")
        .insert(pageData)
        .select("id")
        .single();
      if (createErr) throw createErr;
      pageId = created.id;
    }

    // Update links
    if (Array.isArray(links)) {
      // Delete old links
      await supabaseAdmin.from("bio_links").delete().eq("bio_page_id", pageId);

      // Insert new links
      if (links.length > 0) {
        const linkRows = links.map((l: any, i: number) => ({
          bio_page_id: pageId,
          title: l.title || "",
          url: l.url || "",
          icon: l.icon || null,
          sort_order: i,
        }));
        await supabaseAdmin.from("bio_links").insert(linkRows);
      }
    }

    return NextResponse.json({ ok: true, pageId, slug });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
