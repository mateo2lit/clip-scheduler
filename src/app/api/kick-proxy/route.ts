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

  const debug: Record<string, unknown> = {};

  // Strip "clip_" prefix if present — some API versions want just the ULID
  const bareId = clipId.replace(/^clip_/i, "");

  // Try JSON API variants
  for (const apiUrl of [
    `https://kick.com/api/v2/clips/${clipId}`,
    `https://kick.com/api/v2/clips/${bareId}`,
    `https://kick.com/api/v1/clips/${clipId}`,
  ]) {
    try {
      const res = await fetch(apiUrl, {
        headers: { ...browserHeaders, Accept: "application/json" },
      });
      debug[apiUrl] = res.status;
      if (res.ok) {
        const d = await res.json() as any;
        const clip_url = d.clip_url ?? d.video_url ?? d.url ?? null;
        if (clip_url) {
          return Response.json({ ok: true, clip_url, title: d.title ?? null, duration: d.duration ?? null, source: "api" });
        }
      }
    } catch (e: any) { debug[apiUrl] = e?.message; }
  }

  // Try page HTML (multiple URL patterns)
  const htmlUrls = [
    pageUrl,
    `https://kick.com/clips/${clipId}`,
    `https://kick.com/clips/${bareId}`,
  ].filter(Boolean) as string[];

  for (const targetUrl of htmlUrls) {
    try {
      const res = await fetch(targetUrl, { headers: { ...browserHeaders, Accept: "text/html,*/*" } });
      debug[targetUrl] = res.status;
      if (!res.ok) continue;
      const html = await res.text();
      debug[`${targetUrl}:len`] = html.length;

      // __NEXT_DATA__
      const ndMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (ndMatch) {
        try {
          const data = JSON.parse(ndMatch[1]) as any;
          const pp = data?.props?.pageProps ?? {};
          const clip = pp.clip ?? pp.data?.clip ?? pp.clipData ?? null;
          const clip_url = clip?.clip_url ?? clip?.video_url ?? clip?.url ?? null;
          if (clip_url) {
            return Response.json({ ok: true, clip_url: clip_url.replace(/\\\//g, "/"), title: clip?.title ?? null, duration: clip?.duration ?? null, source: "html_next" });
          }
        } catch {}
      }

      // OG video tag
      const ogMatch = html.match(/<meta[^>]+(?:property="og:video(?::url)?"[^>]+content|content[^>]+property="og:video(?::url)?")[^>]*>/i);
      if (ogMatch) {
        const urlMatch = ogMatch[0].match(/content="([^"]+)"/);
        if (urlMatch?.[1]?.startsWith("http")) {
          return Response.json({ ok: true, clip_url: urlMatch[1], title: null, duration: null, source: "html_og" });
        }
      }

      // Raw regex scan
      const rawMatch = html.match(/"clip_url"\s*:\s*"(https?:[^"]+)"/);
      if (rawMatch) {
        return Response.json({ ok: true, clip_url: rawMatch[1].replace(/\\\//g, "/"), title: null, duration: null, source: "html_raw" });
      }
    } catch (e: any) { debug[targetUrl] = e?.message; }
  }

  return Response.json({ ok: false, error: "Could not retrieve clip info", debug }, { status: 502 });
}
