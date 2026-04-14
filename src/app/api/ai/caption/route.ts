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
        { ok: false, error: "AI captions not configured" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { title, context, platform, tone, existingDescription } = body;

    if (!title && !context) {
      return NextResponse.json(
        { ok: false, error: "Provide a title or context for caption generation" },
        { status: 400 }
      );
    }

    const toneGuide: Record<string, string> = {
      hype: "High energy, exciting, uses strong hooks. Think 'You WON'T believe this' or 'This is INSANE'. Use caps for emphasis sparingly.",
      casual: "Relaxed, conversational, like talking to a friend. Use informal language, maybe some slang.",
      professional: "Clean, polished, informative. Suitable for brands and business content.",
      funny: "Humorous, witty, maybe self-deprecating. Make people smile or laugh.",
      storytelling: "Narrative style, builds curiosity, draws the viewer in with a mini-story.",
    };

    const platformLimits: Record<string, string> = {
      youtube: "YouTube description: up to 5000 chars. Include a hook in the first 2 lines (above the fold). Add relevant keywords naturally.",
      tiktok: "TikTok caption: up to 4000 chars but keep it punchy (under 300 chars is ideal). Front-load the hook.",
      instagram: "Instagram caption: up to 2200 chars. First line is the hook. Use line breaks for readability.",
      facebook: "Facebook post: up to 63,206 chars but shorter performs better. Conversational tone works best.",
      linkedin: "LinkedIn post: up to 3000 chars. Professional but engaging. Use line breaks and short paragraphs.",
      bluesky: "Bluesky post: 300 character limit. Be concise and impactful.",
      x: "X/Twitter: 280 character limit. Every word counts. Strong hooks and clear CTAs.",
      threads: "Threads post: 500 character limit. Conversational and engaging.",
    };

    const selectedTone = toneGuide[tone] || toneGuide.casual;
    const platformGuide = platformLimits[platform] || "Social media post. Keep it engaging.";

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `You are an expert social media copywriter who writes viral captions for content creators.

Content info:
- Title/topic: ${title || "(not specified)"}
- Context: ${context || "(not specified)"}
- Platform: ${platform || "general"}
${existingDescription ? `- Current description (to improve): ${existingDescription}` : ""}

Tone: ${selectedTone}

Platform guidelines: ${platformGuide}

Respond with ONLY valid JSON (no markdown, no code blocks):
{
  "caption": "the full caption text",
  "hook": "just the first line/hook by itself",
  "hashtags": ["tag1", "tag2", "tag3"],
  "callToAction": "a suggested CTA like 'Follow for more' or 'Drop a comment'"
}

Rules:
- The caption should be ready to copy-paste
- Start with a strong hook that stops the scroll
- Include natural line breaks where appropriate (use \\n)
- Suggest 3-5 relevant hashtags (no # prefix)
- The CTA should feel natural, not forced
- Match the platform's culture and best practices
- Do NOT use generic filler or obvious AI phrasing`,
        },
      ],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";

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

    return NextResponse.json({
      ok: true,
      caption: parsed.caption || "",
      hook: parsed.hook || "",
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
      callToAction: parsed.callToAction || "",
    });
  } catch (e: any) {
    console.error("[AI Caption]", e?.message);
    return NextResponse.json(
      { ok: false, error: e?.message || "AI caption generation failed" },
      { status: 500 }
    );
  }
}
