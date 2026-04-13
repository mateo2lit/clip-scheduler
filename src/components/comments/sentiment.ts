import type { Comment, Sentiment, CommentType, EnrichedComment } from "./types";

const POSITIVE_WORDS = new Set([
  "love", "loved", "loving", "great", "amazing", "awesome", "excellent", "fantastic",
  "wonderful", "perfect", "thank", "thanks", "thankyou", "helpful", "best", "beautiful",
  "brilliant", "incredible", "outstanding", "superb", "phenomenal", "goat", "dope",
  "fire", "lit", "chef", "kiss", "masterpiece", "legend", "legendary", "gem",
  "underrated", "subscribed", "subscribe", "binge", "binged", "bingewatching",
  "inspiring", "inspired", "insightful", "informative", "educational",
]);

const NEGATIVE_WORDS = new Set([
  "hate", "hated", "terrible", "awful", "worst", "bad", "boring", "sucks",
  "waste", "disappointed", "disappointing", "annoying", "cringe", "mid",
  "trash", "garbage", "dislike", "unsubscribe", "unsubscribed", "clickbait",
  "misleading", "wrong", "horrible", "useless", "overrated", "mediocre",
  "poorly", "worse", "pathetic", "lame", "generic",
]);

const POSITIVE_EMOJI = /[\u{1F60D}\u{1F60A}\u{1F929}\u{2764}\u{FE0F}?\u{1F525}\u{1F4AF}\u{1F44F}\u{1F64F}\u{1F389}\u{1F31F}\u{2B50}\u{1F44D}\u{1F970}\u{1F618}\u{1F49C}\u{1F499}\u{1F49A}\u{1F496}\u{1F495}\u{1F4A5}\u{1F3C6}\u{1F451}]/gu;
const NEGATIVE_EMOJI = /[\u{1F44E}\u{1F620}\u{1F621}\u{1F92E}\u{1F4A9}\u{1F622}\u{1F624}\u{1F612}\u{1F611}\u{1F614}]/gu;

export function detectSentiment(text: string): Sentiment {
  if (!text) return "neutral";
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/);

  let posScore = 0;
  let negScore = 0;

  for (const word of words) {
    const cleaned = word.replace(/[^a-z]/g, "");
    if (POSITIVE_WORDS.has(cleaned)) posScore++;
    if (NEGATIVE_WORDS.has(cleaned)) negScore++;
  }

  posScore += (text.match(POSITIVE_EMOJI) || []).length;
  negScore += (text.match(NEGATIVE_EMOJI) || []).length;

  if (posScore > negScore && posScore >= 1) return "positive";
  if (negScore > posScore && negScore >= 1) return "negative";
  return "neutral";
}

function isLikelyQuestion(text: string): boolean {
  const t = (text || "").toLowerCase();
  if (t.includes("?")) return true;
  return /(^|\s)(how|what|when|where|why|who|which|can|could|should|do|does|did|is|are|will)\b/.test(t);
}

function hasContentRequestSignal(text: string): boolean {
  const t = (text || "").toLowerCase();
  return (
    /(^|\s)(please|plz|pls)\b/.test(t) ||
    t.includes("part 2") ||
    t.includes("next video") ||
    t.includes("make a video") ||
    t.includes("do a video") ||
    t.includes("tutorial") ||
    t.includes("can you make") ||
    t.includes("you should make") ||
    t.includes("video idea") ||
    t.includes("cover ") ||
    t.includes("explain ")
  );
}

function hasFeedbackSignal(text: string): boolean {
  const t = (text || "").toLowerCase();
  return (
    t.includes("you should") ||
    t.includes("would be better") ||
    t.includes("improve") ||
    t.includes("feedback") ||
    t.includes("suggest")
  );
}

function hasPraiseSignal(text: string): boolean {
  const t = (text || "").toLowerCase();
  return (
    t.includes("love this") ||
    t.includes("love your") ||
    t.includes("great video") ||
    t.includes("great content") ||
    t.includes("amazing video") ||
    t.includes("amazing content") ||
    t.includes("keep it up") ||
    t.includes("keep up the") ||
    t.includes("well done") ||
    t.includes("good job") ||
    t.includes("nice work") ||
    t.includes("subscribed") ||
    t.includes("new subscriber") ||
    t.includes("new sub") ||
    t.includes("this is gold") ||
    t.includes("underrated")
  );
}

export function classifyCommentType(text: string): CommentType {
  if (hasContentRequestSignal(text)) return "content-request";
  if (isLikelyQuestion(text)) return "question";
  if (hasFeedbackSignal(text)) return "feedback";
  if (hasPraiseSignal(text)) return "praise";
  return "general";
}

export function priorityScore(comment: Comment): number {
  const text = comment.text || "";
  const questionBoost = isLikelyQuestion(text) ? 600 : 0;
  const requestBoost = hasContentRequestSignal(text) ? 900 : 0;
  const feedbackBoost = hasFeedbackSignal(text) ? 350 : 0;
  const lengthBoost = Math.min(Math.floor(text.trim().length / 40), 6) * 40;
  const likesBoost = Math.min(comment.likeCount, 150) * 8;
  const recencyBoost = Math.floor(new Date(comment.publishedAt).getTime() / 60000) * 0.001;
  return requestBoost + questionBoost + feedbackBoost + lengthBoost + likesBoost + recencyBoost;
}

export function enrichComment(comment: Comment): EnrichedComment {
  return {
    ...comment,
    sentiment: detectSentiment(comment.text),
    commentType: classifyCommentType(comment.text),
    priorityScore: priorityScore(comment),
  };
}
