export const runtime = "edge";

const WORKER_SECRET = process.env.WORKER_SECRET;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  const clipId = searchParams.get("clipId");
  const pageUrl = searchParams.get("url");

  if (!token || token !== WORKER_SECRET) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!clipId) {
    return Response.json({ ok: false, error: "clipId required" }, { status: 400 });
  }

  const browserHeaders: HeadersInit = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "application/json, text/html, */*",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: "https://kick.com/",
    Origin: "https://kick.com",
  };

  // Try JSON API
  try {
    const res = await fetch(`https://kick.com/api/v2/clips/${clipId}`, {
      headers: { ...browserHeaders, Accept: "application/json" },
    });
    if (res.ok) {
      const d = await res.json() as any;
      return Response.json({
        ok: true,
        clip_url: d.clip_url ?? d.video_url ?? null,
        title: d.title ?? null,
        duration: d.duration ?? null,
        source: "api",
      });
    }
  } catch {}

  // Fallback: scrape page HTML for __NEXT_DATA__
  if (pageUrl) {
    try {
      const res = await fetch(pageUrl, { headers: { ...browserHeaders, Accept: "text/html,*/*" } });
      if (res.ok) {
        const html = await res.text();
        const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
        if (match) {
          const data = JSON.parse(match[1]) as any;
          const clip = data?.props?.pageProps?.clip ?? data?.props?.pageProps?.data?.clip;
          if (clip?.clip_url) {
            return Response.json({
              ok: true,
              clip_url: clip.clip_url,
              title: clip.title ?? null,
              duration: clip.duration ?? null,
              source: "html",
            });
          }
        }
      }
    } catch {}
  }

  return Response.json({ ok: false, error: "Could not retrieve clip info" }, { status: 502 });
}
