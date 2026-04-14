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
        { ok: false, error: "AI insights not configured" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { metrics, totals, prevTotals, range, platforms } = body;

    if (!metrics || metrics.length === 0) {
      return NextResponse.json({
        ok: true,
        insights: ["Post more content to get AI-powered performance insights."],
      });
    }

    // Build a concise summary for the AI
    const topPosts = metrics
      .slice(0, 10)
      .map((m: any) => `"${m.title}" on ${m.platform}: ${m.views} views, ${m.likes} likes, ${m.comments} comments`)
      .join("\n");

    const platformBreakdown = Object.entries(
      metrics.reduce((acc: Record<string, { posts: number; views: number; likes: number; comments: number }>, m: any) => {
        if (!acc[m.platform]) acc[m.platform] = { posts: 0, views: 0, likes: 0, comments: 0 };
        acc[m.platform].posts++;
        acc[m.platform].views += m.views;
        acc[m.platform].likes += m.likes;
        acc[m.platform].comments += m.comments;
        return acc;
      }, {} as Record<string, any>)
    )
      .map(([p, d]: [string, any]) => `${p}: ${d.posts} posts, ${d.views} views, ${d.likes} likes, ${d.comments} comments`)
      .join("\n");

    const viewsChange = prevTotals?.views > 0
      ? ((totals.views - prevTotals.views) / prevTotals.views * 100).toFixed(1)
      : null;
    const likesChange = prevTotals?.likes > 0
      ? ((totals.likes - prevTotals.likes) / prevTotals.likes * 100).toFixed(1)
      : null;

    // Find best posting times
    const hourCounts: Record<number, { engagement: number; count: number }> = {};
    const dayCounts: Record<number, { engagement: number; count: number }> = {};
    for (const m of metrics) {
      const d = new Date(m.postedAt);
      const hour = d.getHours();
      const day = d.getDay();
      if (!hourCounts[hour]) hourCounts[hour] = { engagement: 0, count: 0 };
      hourCounts[hour].engagement += m.views + m.likes + m.comments;
      hourCounts[hour].count++;
      if (!dayCounts[day]) dayCounts[day] = { engagement: 0, count: 0 };
      dayCounts[day].engagement += m.views + m.likes + m.comments;
      dayCounts[day].count++;
    }

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `You are a social media analytics expert. Analyze this creator's performance data and give actionable insights.

Time period: ${range === "24h" ? "last 24 hours" : range === "1w" ? "last 7 days" : range === "1m" ? "last 30 days" : "last year"}
Total posts: ${metrics.length}
Total views: ${totals.views.toLocaleString()} ${viewsChange ? `(${Number(viewsChange) >= 0 ? "+" : ""}${viewsChange}% vs prev period)` : ""}
Total likes: ${totals.likes.toLocaleString()} ${likesChange ? `(${Number(likesChange) >= 0 ? "+" : ""}${likesChange}% vs prev period)` : ""}
Total comments: ${totals.comments.toLocaleString()}
Engagement rate: ${totals.views > 0 ? ((totals.likes + totals.comments) / totals.views * 100).toFixed(2) : 0}%

Platform breakdown:
${platformBreakdown}

Top performing posts:
${topPosts}

Respond with ONLY valid JSON (no markdown, no code blocks):
{
  "insights": [
    "insight 1 — specific, actionable, references actual data",
    "insight 2 — specific, actionable, references actual data",
    "insight 3 — specific, actionable, references actual data"
  ]
}

Rules:
- Return exactly 3-5 insights
- Each insight should be 1 sentence, max 25 words
- Reference specific numbers, platforms, or posts
- Focus on: what's working, what to improve, and timing recommendations
- Be encouraging but honest
- Use plain text, no markdown or emojis`,
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
        { ok: true, insights: ["Your content is performing well. Keep posting consistently to see detailed trends."] }
      );
    }

    const insights = Array.isArray(parsed.insights) ? parsed.insights.slice(0, 5) : [];

    return NextResponse.json({ ok: true, insights });
  } catch (e: any) {
    console.error("[AI Insights]", e?.message);
    return NextResponse.json(
      { ok: false, error: e?.message || "AI insights failed" },
      { status: 500 }
    );
  }
}
