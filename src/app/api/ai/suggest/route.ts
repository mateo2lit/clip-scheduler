import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getTeamContext } from "@/lib/teamAuth";

export const runtime = "nodejs";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
});

export async function POST(req: Request) {
  try {
    const result = await getTeamContext(req);
    if (!result.ok) return result.error;

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "AI suggestions not configured" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { title, description, platforms, filename, existingHashtags } = body;

    const platformList = (platforms || ["youtube"]).join(", ");
    const existingTags = (existingHashtags || []).join(", ");

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `You are a social media algorithm expert. Your job is to suggest hashtags that maximize discoverability, reach, and engagement for content creators.

Video info:
- File name: ${filename || "unknown"}
- Title: ${title || "(none)"}
- Description: ${description || "(none)"}
- Posting to: ${platformList}
${existingTags ? `- Already using: ${existingTags}` : ""}

Respond with ONLY valid JSON (no markdown, no code blocks):
{
  "hashtags": [
    {"tag": "tagname", "reason": "brief reason why this helps"},
    {"tag": "tagname", "reason": "brief reason why this helps"}
  ]
}

Rules:
- Return 10-15 hashtag suggestions (no # prefix, just the word)
- Do NOT include any tags the creator is already using
- Mix of strategies:
  - 3-4 HIGH VOLUME tags (millions of posts, broad reach like "viral", "fyp", "trending")
  - 4-5 MEDIUM NICHE tags (thousands of posts, targeted audience)
  - 3-4 SPECIFIC LONG-TAIL tags (less competitive, easier to rank for)
- Prioritize tags that actually drive algorithm performance on ${platformList}:
  - YouTube: tags that match search intent and suggested video recommendations
  - TikTok: FYP-boosting tags, trending sounds/challenges if relevant
  - Instagram: mix of explore-page tags and community tags
  - LinkedIn: professional/industry tags that boost feed visibility
  - Facebook: engagement-driving tags for shares and reach
- Keep reasons very short (5-10 words max)
- Tags should be lowercase, no spaces (use camelCase or single words)`,
        },
      ],
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "";

    let parsed;
    try {
      const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { ok: false, error: "Failed to parse AI response" },
        { status: 500 }
      );
    }

    const hashtags = Array.isArray(parsed.hashtags)
      ? parsed.hashtags.map((h: any) => ({
          tag: typeof h === "string" ? h : h.tag || "",
          reason: typeof h === "string" ? "" : h.reason || "",
        }))
      : [];

    return NextResponse.json({ ok: true, hashtags });
  } catch (e: any) {
    console.error("[AI Suggest]", e?.message);
    return NextResponse.json(
      { ok: false, error: e?.message || "AI suggestion failed" },
      { status: 500 }
    );
  }
}
