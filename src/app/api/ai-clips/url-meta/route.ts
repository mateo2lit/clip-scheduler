import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");
  if (!url) return NextResponse.json({ ok: false }, { status: 400 });

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await fetch(oembedUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ClipDash/1.0)" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return NextResponse.json({ ok: false }, { status: res.status });
    const data = await res.json();
    return NextResponse.json({
      ok: true,
      title: data.title ?? "",
      authorName: data.author_name ?? "",
      thumbnailUrl: data.thumbnail_url ?? "",
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
