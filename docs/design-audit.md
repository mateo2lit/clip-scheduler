# Clip Dash design audit: making it look designed, not generated

*Reviewed September 26, 2026. I looked at the homepage, /platforms, a platform page, the blog, a blog post and the login page on desktop (1440px) and on a phone (390px), and scanned the app's code for patterns that repeat across pages. I didn't click through the logged-in app (dashboard, uploads, settings) because that needs a login against the live database, so those findings come from the code only.*

**Timing:** the marketing pages can change anytime. Wait until Meta decides before touching the upload, settings and other screens the Meta reviewer uses.

## The short version

Clip Dash doesn't look broken or cheap. It looks **like a default**: the same dark-mode SaaS template that a lot of AI-built products land on. The giveaways aren't one big thing but a stack of small defaults:

1. **No chosen typeface.** The site uses whatever font the visitor's computer has (Segoe UI on Windows, San Francisco on Mac). Nothing about the type says "Clip Dash".
2. **A blue→purple→pink gradient** on one or two words of each headline, on the logo, on the pricing cards and on a button. Coloring one word of a headline is the most recognizable generated-page trait there is.
3. **Glowing neon platform icons** and colored glows under cards (76 colored glow shadows in the code).
4. **Everything is a rounded card in a grid**, and every section follows the same pattern: centered headline, gray line underneath, grid of cards.
5. **Small pill labels above headings** ("Built for video creators — not brands", "The math is simple", "PRICING", "BEST VALUE", "UPGRADE UNLOCKS"), which add decoration without adding information.
6. **Copy tells:** 181 em dashes in on-screen text, headlines that could sit on any SaaS site ("Built to handle the whole workflow", "Stop posting manually. Start growing."), and subtitles that repeat the headline.

The good news: the product itself is the strongest asset. The real scheduler and calendar screenshots already do more than any marketing graphic. A redesign should let the product carry the page and strip away the template decoration around it.

---

## Fix before anything else (accuracy and privacy, not design)

These make the site look careless or undermine trust, whatever the design:

| Where | Problem | Fix |
|---|---|---|
| `/platforms/tiktok` | Says "TikTok requires app review… Clip Dash has submitted for review". TikTok approved Clip Dash on March 10, and the site should never say publicly that it's awaiting a review. | Delete that note (line 79 of `src/app/platforms/[platform]/page.tsx`). |
| Homepage stats block | "All 6" platforms and a "YouTube, TikTok, IG, FB, LinkedIn, Bluesky" caption. There are 8. | Update, or remove the block (see below). |
| Homepage pricing | "All 7 supported platforms" in both plan lists. | "All 8 platforms". |
| Homepage stats | "The average creator loses 8–12 hours a week" and "6x reach" have no source. Made-up-looking statistics are a strong generated-content signal, and a risk if anyone asks. | Remove them, or replace with something you can stand behind ("One upload instead of eight"). |
| `/platforms/tiktok` | Mentions the "TikTok Creator Fund", which TikTok replaced with its Creator Rewards Program. The big stat tiles (1B+, 95 min, 167M+) have no sources. | Update the wording; cut the stat tiles or cite them. |
| Homepage product images | `product-scheduler.png` and the hero demo show your streaming accounts ("Mateo LIVE", "mateo2lit") on a page whose footer names Shaky Ventures LLC. That links your streaming persona to the business. | Re-record the screenshots and demo with a neutral demo account ("Nova Plays", say) and made-up post titles. Also do the calendar screenshot, which shows real post titles. |
| Pricing buttons | "No Payment Necessary To Sign Up" is in Title Case, while everything else is sentence case. | "No card needed to start." |

---

## The design issues, most noticeable first

### 1. Typography: pick a typeface (biggest single improvement)
- **Now:** no font is set, so headings and body use the system UI font at a few default weights. The logo uses a different, heavier font, so the page and logo don't match.
- **Why it matters:** type is the first thing that makes a site feel designed. Right now nothing distinguishes Clip Dash's text from a default app.
- **Do:** choose one or two typefaces and load them with `next/font`. A characterful grotesk for headlines, and a clean, highly readable sans for body and UI. Set a real type scale (about 5–6 sizes) and stick to it. The code currently uses one-off sizes like 7, 8, 9, 10, 11 and 15px; the 7–9px text in the product mockups is unreadable.
- **Also:** use sentence case on buttons ("Try for free", not "Try For Free").

### 2. Color: one brand color, used on purpose
- **Now:** a blue, violet and pink gradient appears on headline words ("Post everywhere", "on distribution", "creators", "free with every plan" in green), the logo bars, both pricing cards (one blue, one purple), and the Team plan's button. There are 86 blue/purple/pink gradient stops in the code, plus about 20 different shades of white text (`text-white/5` through `/95`), which makes the hierarchy muddy.
- **Do:** choose a single brand accent and use it only for the primary action and key highlights. Keep headlines one color. Cut the text shades down to four roles: primary, secondary, muted, disabled.
- **Direction to consider:** Clip Dash is about streams and clips, so borrow from broadcast gear rather than generic SaaS. Picture a graphite base with a single "tally light" red accent, the color of a camera's live indicator, reserved for the primary action and anything live or scheduled. Stay away from Twitch purple (it belongs to Twitch) and from the blue/purple gradient (it belongs to everyone).

### 3. Remove the glow and decoration
- Neon glow under each platform icon in the hero, colored glows under the pricing cards and product frame, blurred color blobs in the background.
- Six feature cards whose icon sits in a large, empty, tinted bar. It reads as unfinished.
- "How it works" as three gradient number circles with arrows between cards.
- **Do:** delete all the glows. Show platform icons in their normal colors at a normal size, or as a quiet monochrome row. Remember the design principle: be bold in one place and keep everything around it quiet.

### 4. Break the "every section is the same" rhythm
- **Now:** eight sections in a row use centered headline, gray subtitle, grid or card. The platform list appears four times on the homepage: hero icons, the first feature card, the calendar legend, and a full "Supported Platforms" grid.
- **Do:**
  - **Hero:** left-aligned text beside a large product visual, not centered text over everything.
  - **Features:** a two-column list of what it does, with the product screenshot changing as you read, instead of six identical cards.
  - **Platforms:** show them once.
  - **"How it works":** only keep it if it adds something beyond the hero. It currently repeats it.

### 5. Cut the pill labels and filler lines
Remove "Built for video creators — not brands", "The math is simple", "PRICING", "Included free · No extra cost", "For solo creators", "BEST VALUE" and "UPGRADE UNLOCKS" unless one carries real information. "Best value" arguably does; the rest restate the heading below them.

Also drop the gray line under every section headline when it just says the headline again ("One tool to manage your entire content pipeline", "Everything you need to know before getting started", "Start saving time immediately with Clip Dash").

### 6. Rewrite the copy in your own voice
- **Em dashes:** there are 181 in on-screen text. They're a known sign of AI-written copy. Use periods and commas.
- **Generic lines to rewrite:** "Built to handle the whole workflow", "Stop posting manually. Start growing.", "Friendly pricing for creators", "Schedule and relax", "The Short-Form Video Giant".
- **Stop repeating the platform list.** It appears in almost every paragraph ("YouTube, TikTok, Instagram, Facebook, LinkedIn, Bluesky, X, and Pinterest").
- **Write like a streamer talking to streamers.** Specific beats clever. For example: "Clip it on stream. It's on TikTok, Shorts and Reels by morning."
- **The "30 min → 60 sec" block:** strikethrough before/after numbers with invented metrics is a very common generated-landing-page pattern. Replace it with something true, like a short real walkthrough or one line from a real user once you have one.

### 7. Shape and spacing consistency
- **Corners:** 426 fully rounded elements, 64 very rounded and 162 rounded cards. Buttons, inputs, badges, chips and toggles are all pills, even the login inputs. Pick three radius levels (small for inputs and chips, medium for cards, full only for avatars and toggles) and apply them by role.
- **Animation:** 49 pulse/bounce/ping animations in the app. Keep motion for things that respond to the user or show a live state (posting now, uploading). Remove ambient animation.
- **Emoji as decoration:** onboarding (🎬🏢📊🚀) and the welcome screen (🎉🔗📤📊). Replace them with the same icon set used elsewhere. Emoji in the caption emoji picker are fine; that's a feature.

### 8. Phone layout
- **Header buttons:** "Sign In" and "Get Started" wrap onto two lines at phone width.
- **Hero icons:** the row runs off both edges of the screen, cutting off YouTube and Pinterest.
- **Product screenshot:** too small on a phone to read anything. Use a cropped, zoomed-in phone-specific version, or a short looping video.

### 9. Logo
The wordmark is set in a different font from the rest of the site, and its gradient bars repeat the blue/purple/orange gradient. Once a typeface and accent color are chosen, redraw the logo to match: one color, the new type, and a simpler mark.

### 10. Secondary pages
- **/platforms:** eight identical cards, each with a generic hype line and a user-count stat. Consider a plain, well-set list: platform, what Clip Dash can post there, and any requirements (like Instagram needing a Business or Creator account).
- **Platform detail pages:** the numbered "Why post on TikTok?" items styled as cards are platform marketing Clip Dash doesn't need to do. Focus the page on what Clip Dash does for that platform and the settings it supports. That part is already good and specific.
- **Login:** clean and fine. Match it to the new type and color, and make the inputs rectangular rather than pill-shaped.
- **Blog:** the article pages are readable. The listing page is another card grid; a simple list of titles, dates and summaries reads more editorial.

---

## Suggested order of work (after Meta approval)

1. **Day 1, accuracy and trust:** everything in the "fix before anything else" table. It's small, and some of it (the TikTok note, the platform counts) could reasonably go out before Meta decides, since none of it touches frozen files.
2. **Days 2–3, foundations:**
   - Choose the typeface and accent color, and write design tokens: colors, text roles, font sizes, radii, spacing.
   - Remove gradients, glows, blobs, decorative labels and emoji.
   - Fix the phone header and icon row.
3. **Days 4–6, homepage restructure:** product-led hero, features as a list beside the product, platforms shown once, pricing as a clean two-column comparison, FAQ, footer. Rewrite the copy while doing it.
4. **Afterwards, the app:** apply the same tokens to the logged-in screens in one pass: dashboard, uploads, settings, calendar, analytics, comments and onboarding. That's where the 20 text shades and inconsistent corners mostly live.

**Before building:** mock up two or three directions for the hero and pricing sections and compare them side by side. The type and color choice is the decision that shapes everything else, so it's worth seeing options before committing.
