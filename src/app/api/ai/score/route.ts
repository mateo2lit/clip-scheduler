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
        { ok: false, error: "AI scoring not configured" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { title, description, platform, hashtags, scheduledTime } = body;

    if (!title && !description) {
      return NextResponse.json(
        { ok: false, error: "Provide a title or description to score" },
        { status: 400 }
      );
    }

    const scheduledDate = scheduledTime ? new Date(scheduledTime) : null;
    const dayOfWeek = scheduledDate
      ? ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][scheduledDate.getDay()]
      : null;
    const hour = scheduledDate ? scheduledDate.getHours() : null;

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `You are a social media algorithm expert. Score this post's viral potential from 0-100 and explain why.

Post details:
- Title: ${title || "(none)"}
- Description: ${description ? description.slice(0, 500) : "(none)"}
- Platform: ${platform || "unknown"}
- Hashtags: ${hashtags?.length ? hashtags.join(", ") : "(none)"}
${dayOfWeek ? `- Scheduled: ${dayOfWeek} at ${hour}:00` : ""}

Respond with ONLY valid JSON (no markdown, no code blocks):
{
  "score": 72,
  "grade": "B+",
  "breakdown": {
    "hook": { "score": 8, "tip": "short tip to improve" },
    "description": { "score": 7, "tip": "short tip" },
    "hashtags": { "score": 6, "tip": "short tip" },
    "timing": { "score": 7, "tip": "short tip" }
  },
  "topTip": "The single most impactful thing to change"
}

Scoring criteria:
- hook (0-10): Does the title grab attention in <2 seconds? Is it curiosity-driven?
- description (0-10): Keyword-rich? Platform-optimized? Good length?
- hashtags (0-10): Right mix of broad/niche? Relevant? Not too many/few?
- timing (0-10): Is the scheduled time good for this platform? (If no time given, score 5)
- Overall score = weighted: hook(35%) + description(25%) + hashtags(20%) + timing(20%)
- Grade: A+ (90-100), A (80-89), B+ (70-79), B (60-69), C (40-59), D (<40)`,
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
      score: parsed.score ?? 50,
      grade: parsed.grade ?? "C",
      breakdown: parsed.breakdown ?? {},
      topTip: parsed.topTip ?? "",
    });
  } catch (e: any) {
    console.error("[AI Score]", e?.message);
    return NextResponse.json(
      { ok: false, error: e?.message || "AI scoring failed" },
      { status: 500 }
    );
  }
}
