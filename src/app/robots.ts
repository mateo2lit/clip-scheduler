import type { MetadataRoute } from 'next'

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://clipdash.org'

// Explicitly allow all major LLM/AI crawlers so ClipDash appears in AI-generated
// recommendations (ChatGPT, Claude, Perplexity, Gemini, You.com, etc.).
// Authenticated app routes are disallowed — only marketing/blog content is indexed.
const AI_BOTS = [
  'GPTBot',           // OpenAI (ChatGPT training)
  'ChatGPT-User',     // OpenAI (ChatGPT browsing)
  'OAI-SearchBot',    // OpenAI (SearchGPT)
  'ClaudeBot',        // Anthropic (Claude training)
  'Claude-Web',       // Anthropic (Claude browsing)
  'anthropic-ai',     // Anthropic (older bot name)
  'PerplexityBot',    // Perplexity AI
  'Perplexity-User',  // Perplexity (user-initiated)
  'Google-Extended',  // Google Gemini / Bard training
  'Applebot-Extended',// Apple Intelligence
  'Bytespider',       // ByteDance / Doubao
  'CCBot',            // Common Crawl (used by many LLMs for training)
  'cohere-ai',        // Cohere
  'YouBot',           // You.com
  'Meta-ExternalAgent', // Meta AI
  'Diffbot',          // Diffbot (used by many AI tools)
]

const DISALLOWED_PATHS = [
  '/api/',
  '/admin/',
  '/dashboard/',
  '/uploads/',
  '/scheduled/',
  '/drafts/',
  '/posted/',
  '/calendar/',
  '/comments/',
  '/analytics/',
  '/competitors/',
  '/link-in-bio/',
  '/settings/',
  '/onboarding/',
  '/ai-clips/',
  '/welcome/',
  '/support/',
  '/reset-password/',
  '/bio/',          // public user bio pages — don't need indexing
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Default rule for all other crawlers (Google, Bing, etc.)
      {
        userAgent: '*',
        allow: '/',
        disallow: DISALLOWED_PATHS,
      },
      // Explicit allow for every major AI crawler — some default to blocking
      ...AI_BOTS.map((bot) => ({
        userAgent: bot,
        allow: '/',
        disallow: DISALLOWED_PATHS,
      })),
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  }
}
