# Clip Dash — Feature Roadmap

## Tier 1: Must-Have (Immediate Revenue & Retention Impact)

### Stripe Billing Integration
- Wire up the Free / Pro ($12/mo) / Team ($29/mo) pricing tiers already on the landing page
- Enforce plan limits (5 uploads/mo on Free, unlimited on Pro)
- Manage subscriptions, upgrades, cancellations
- **Why:** No revenue without it. Every day without billing is lost income.
- **Effort:** Medium

### Basic Analytics Dashboard
- Pull views, likes, and comments per post from each platform's API (YouTube Data API, TikTok API, Instagram Insights API, Facebook Insights)
- Aggregate stats per platform (total views, engagement rate, top posts)
- Show performance trends over time (weekly/monthly)
- **Why:** Creators need to know what's working. Without analytics, they'll use another tool alongside yours — that's a churn risk.
- **Effort:** Large

### Content Calendar View
- Weekly and monthly visual calendar showing scheduled posts as colored blocks by platform
- Drag-and-drop to reschedule posts
- Click to view/edit post details
- Filter by platform, status, or date range
- **Why:** Every competitor has this. It's table-stakes for content planning and the #1 expected feature in a scheduling tool.
- **Effort:** Medium

### X (Twitter) Support
- OAuth integration for X/Twitter accounts
- Post scheduling with character limits (280 chars)
- Support for video tweets
- **Why:** Completes the platform lineup. X is still a major platform for creators cross-promoting video content.
- **Effort:** Medium

---

## Tier 2: High-Value Differentiators

### AI Caption & Description Generator
- Use Claude or GPT to generate titles, descriptions, and hashtags from video filename, thumbnail, or a short user prompt
- Platform-aware generation (different tone/length for YouTube vs TikTok vs Instagram)
- One-click "Generate" button in the upload flow
- **Why:** Huge time-saver for creators who post daily. Most competitors charge extra AI credits — including this free is a strong differentiator.
- **Effort:** Medium

### Cross-Platform Posting (Upload Once, Post Everywhere)
- Single upload flow where users select multiple platforms at once
- Customize title, description, hashtags, and settings per platform in the same view
- Schedule all posts together or at different times
- **Why:** This is what the landing page promises ("Upload once. Post everywhere.") but the current flow only supports one platform per upload.
- **Effort:** Medium

### Optimal Posting Time Suggestions
- Analyze historical post performance to recommend best days/times per platform
- Fall back to platform-wide averages (e.g., "TikTok engagement peaks at 7pm") when user data is insufficient
- Show suggested time slots in the scheduling picker
- **Why:** Buffer, Hootsuite, and Metricool all offer this. Even basic heuristics add real value for creators guessing when to post.
- **Effort:** Small–Medium

### Post Editing After Scheduling
- Edit title, description, hashtags, scheduled time, and platform settings on already-scheduled posts
- Cancel and re-draft scheduled posts
- **Why:** Currently there's no way to modify a post after scheduling it. Users have to delete and re-create.
- **Effort:** Small

---

## Tier 3: Competitive Parity

### Bulk Upload
- Upload 5–10 videos at once via multi-file picker or drag-and-drop
- Batch-assign platform, schedule time, and default settings
- Edit individual posts after bulk creation
- **Why:** Creators often batch-record content and need to schedule a week's worth of videos in one session.
- **Effort:** Medium

### Post Duplication
- One-click "Clone to another platform" on any scheduled, posted, or draft post
- Pre-fills title, description, and hashtags adapted to the target platform's limits
- **Why:** Quick cross-posting without the full multi-platform flow. Low effort, high convenience.
- **Effort:** Small

### Content Recycling
- Mark posts as "evergreen" to automatically re-queue them on a cadence
- Set expiration dates for time-sensitive content
- **Why:** SocialBee's signature feature. Valuable for creators with educational or entertainment content that stays relevant.
- **Effort:** Medium

### Hashtag Suggestions
- Auto-suggest relevant hashtags based on title and description
- Show hashtag popularity/reach estimates
- Platform-specific suggestions (trending on TikTok vs YouTube)
- **Why:** Saves time and improves discoverability. Several competitors offer this.
- **Effort:** Small

### Instagram First Comment
- Schedule a first comment (usually hashtags) to post immediately after the Reel publishes
- Backend support already exists — just needs UI in the upload flow
- **Why:** Industry-standard practice for Instagram. Keeps captions clean while maintaining discoverability.
- **Effort:** Small

### Notification System
- Email notifications when a scheduled post succeeds or fails
- Optional digest email (daily/weekly summary of post activity)
- In-app notification bell for real-time updates
- **Why:** Currently there's no way to know if a post failed without manually checking the dashboard.
- **Effort:** Medium

---

## Tier 4: Future Differentiators

### Mobile App (or PWA)
- Progressive Web App as a lower-effort alternative to native iOS/Android apps
- Core functionality: view scheduled posts, quick-schedule from camera roll, check analytics
- Push notifications for post success/failure
- **Why:** Creators are mobile-first. Every competitor has a mobile app (even if users complain about quality).
- **Effort:** Large

### Video Trimming & Editing
- Basic in-browser trim (set start/end points)
- Crop and aspect ratio adjustment (9:16, 1:1, 16:9)
- Add text overlays and simple captions
- **Why:** No competitor does this well in-browser. Could be a major differentiator that keeps creators inside your tool instead of switching to CapCut/Premiere.
- **Effort:** Very Large

### Social Inbox
- Unified view of comments across all connected platforms
- Reply to YouTube, TikTok, Instagram, and Facebook comments from one place
- Filter by platform, sentiment, or read/unread status
- **Why:** Hootsuite, Sprout Social, and Vista Social all offer this. Saves creators from checking 4 separate apps for engagement.
- **Effort:** Large

### Client / Agency Mode
- Manage multiple brands/workspaces from one account
- Client-level permissions (view-only, approval required)
- White-label options for agencies
- **Why:** Vista Social and Publer target the agency market. Opens up a higher-revenue customer segment.
- **Effort:** Large

### Webhook / Zapier Integration
- Webhooks for post events (scheduled, posted, failed)
- Zapier triggers and actions for connecting to other tools
- API access for power users and developers
- **Why:** Lets creators plug Clip Dash into their existing workflows (Notion, Slack, Airtable, etc.).
- **Effort:** Medium
