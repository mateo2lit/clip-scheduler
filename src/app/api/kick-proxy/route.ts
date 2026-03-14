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

  // Try JSON API v2
  for (const apiUrl of [
    `https://kick.com/api/v2/clips/${clipId}`,
    `https://kick.com/api/v1/clips/${clipId}`,
  ]) {
    try {
      const res = await fetch(apiUrl, {
        headers: { ...browserHeaders, Accept: "application/json" },
      });
      if (res.ok) {
        const d = await res.json() as any;
        const clip_url = d.clip_url ?? d.video_url ?? d.url ?? null;
        if (clip_url) {
          return Response.json({
            ok: true,
            clip_url,
            title: d.title ?? null,
            duration: d.duration ?? null,
            source: "api",
          });
        }
      }
    } catch {}
  }

  // Fallback: scrape page HTML
  const targetUrl = pageUrl ?? `https://kick.com/clips/${clipId}`;
  try {
    const res = await fetch(targetUrl, { headers: { ...browserHeaders, Accept: "text/html,*/*" } });
    if (res.ok) {
      const html = await res.text();

      // Try __NEXT_DATA__ JSON blob first
      const ndMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (ndMatch) {
        try {
          const data = JSON.parse(ndMatch[1]) as any;
          const pp = data?.props?.pageProps ?? {};
          const clip = pp.clip ?? pp.data?.clip ?? pp.clipData ?? null;
          const clip_url = clip?.clip_url ?? clip?.video_url ?? clip?.url ?? null;
          if (clip_url) {
            return Response.json({
              ok: true,
              clip_url: clip_url.replace(/\\\//g, "/"),
              title: clip?.title ?? null,
              duration: clip?.duration ?? null,
              source: "html_next",
            });
          }
        } catch {}
      }

      // Last resort: regex scan the raw HTML for clip_url value
      const m = html.match(/"clip_url"\s*:\s*"(https?:[^"]+)"/);
      if (m) {
        return Response.json({
          ok: true,
          clip_url: m[1].replace(/\\\//g, "/"),
          title: null,
          duration: null,
          source: "html_raw",
        });
      }
    }
  } catch {}

  return Response.json({ ok: false, error: "Could not retrieve clip info" }, { status: 502 });
}
