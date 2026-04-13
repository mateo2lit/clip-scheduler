import { NextResponse } from "next/server";

// RFC-1918 private address ranges + loopback — block SSRF attempts
const PRIVATE_IP_RE =
  /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|localhost)/i;

function isBlockedHost(urlStr: string): boolean {
  try {
    const { hostname } = new URL(urlStr);
    return PRIVATE_IP_RE.test(hostname);
  } catch {
    return true;
  }
}

function extractMeta(html: string, property: string): string | null {
  // Match both property="..." and name="..." variants
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
    "i"
  );
  return (re.exec(html) || re2.exec(html))?.[1] ?? null;
}

function extractTitle(html: string): string | null {
  return /<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1]?.trim() ?? null;
}

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  // Validate URL shape
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return NextResponse.json({ error: "Only http/https URLs are supported" }, { status: 400 });
  }

  // SSRF guard
  if (isBlockedHost(url)) {
    return NextResponse.json({ error: "URL not allowed" }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          // Many sites return OG data for this well-known crawler UA
          "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "follow",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      return NextResponse.json({ error: `Fetch failed: ${res.status}` }, { status: 502 });
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      return NextResponse.json({ error: "URL does not return HTML" }, { status: 422 });
    }

    // Read only first 50 KB — OG tags are always in <head>
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let bytesRead = 0;
    const MAX_BYTES = 50 * 1024;

    if (reader) {
      while (bytesRead < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        chunks.push(value);
        bytesRead += value.length;
      }
      reader.cancel().catch(() => {});
    }

    const html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");

    const ogTitle = extractMeta(html, "og:title");
    const ogDescription = extractMeta(html, "og:description");
    const ogImage = extractMeta(html, "og:image");
    const title = ogTitle || extractTitle(html) || parsed.hostname;
    const description = ogDescription || "";
    const domain = parsed.hostname.replace(/^www\./, "");

    return NextResponse.json(
      { title, description, image: ogImage, domain },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600",
        },
      }
    );
  } catch (e: any) {
    if (e?.name === "AbortError") {
      return NextResponse.json({ error: "Request timed out" }, { status: 504 });
    }
    return NextResponse.json({ error: "Failed to fetch URL" }, { status: 502 });
  }
}
