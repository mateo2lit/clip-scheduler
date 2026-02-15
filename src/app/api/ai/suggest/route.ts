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
    const { title, description, platforms, filename } = body;

    const platformList = (platforms || ["youtube"]).join(", ");

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `You are a social media expert helping a content creator optimize their video post. Generate suggestions to maximize engagement.

Current info:
- File name: ${filename || "unknown"}
- Title: ${title || "(none)"}
- Description: ${description || "(none)"}
- Posting to: ${platformList}

Respond with ONLY valid JSON in this exact format (no markdown, no code blocks):
{
  "title": "suggested title (catchy, under 100 chars)",
  "description": "suggested description (engaging, platform-appropriate, 1-3 sentences)",
  "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}

Rules:
- If the current title is good, improve it slightly rather than completely changing it
- Hashtags should be relevant and trending-friendly (no # prefix, just the word)
- Keep the description concise but engaging
- Tailor tone for the platforms: YouTube (searchable/descriptive), TikTok (casual/trendy), Instagram (aesthetic/hashtag-heavy), LinkedIn (professional), Facebook (conversational)
- If posting to multiple platforms, find a tone that works across all of them
- Return 5-8 hashtags`,
        },
      ],
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "";

    // Parse the JSON response
    let suggestions;
    try {
      // Strip markdown code blocks if present
      const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      suggestions = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { ok: false, error: "Failed to parse AI response" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      suggestions: {
        title: suggestions.title || "",
        description: suggestions.description || "",
        hashtags: Array.isArray(suggestions.hashtags) ? suggestions.hashtags : [],
      },
    });
  } catch (e: any) {
    console.error("[AI Suggest]", e?.message);
    return NextResponse.json(
      { ok: false, error: e?.message || "AI suggestion failed" },
      { status: 500 }
    );
  }
}
