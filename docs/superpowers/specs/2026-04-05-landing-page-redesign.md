# Landing Page Redesign — Design Spec
**Date:** 2026-04-05  
**Status:** Approved

## Goal
Make the landing page look more professional by adding a real product screenshot to the hero, cleaning up redundant sections, and improving visual hierarchy throughout. Pricing section is kept nearly identical.

## Constraints
- Keep the floating platform icons in the hero
- Keep the clickable "Supported Platforms" section (links to `/platforms/<platform>`)
- Keep the pricing section visually close to current
- Images available: scheduling UI (`chrome_HfSIDVApui.png`), calendar (`chrome_mHNex2mIL0.png`), dashboard, posted content, import modal

## Section Structure (approved)

### 1. Nav
No changes.

### 2. Hero
- Keep: headline ("Upload once. Post everywhere."), subtext, CTA buttons, floating platform icons
- Add: large product screenshot (scheduling/configure UI — `chrome_HfSIDVApui.png`) below the platform icons, framed in a dark card
  - Border: subtle blue/purple gradient glow
  - Slight drop shadow
  - Full width up to `max-w-5xl`
- Add: faint radial gradient bloom (blue → purple, ~10–15% opacity) centered behind the headline for depth

### 3. Features Grid
- Keep all 6 feature cards
- Remove the standalone Twitch/Kick Import section (already covered by feature card #2)
- Make the first card ("6 Platforms, One Workflow") span `col-span-full` on large screens with a horizontal layout:
  - Left: icon + title + description
  - Right: row of 6 platform icon SVGs (same as hero but static, smaller)
- Remaining 5 cards in a `lg:grid-cols-3` grid below: row 1 = 3 cards, row 2 = 2 cards (centered with `mx-auto` or `col-start-2`)

### 4. How It Works
- Keep 3 steps
- Add a dashed horizontal connector line between steps on desktop (`sm:` and up)
- Slightly increase step number badge size (from `w-10 h-10` to `w-12 h-12`)

### 5. Screenshot Showcase (NEW — replaces Twitch/Kick section and stats bar)
- Section headline: "Your entire content calendar, across all platforms."
- Subtext: "Every scheduled post across YouTube, TikTok, Instagram, Facebook, LinkedIn, and Bluesky — in one view."
- Calendar screenshot (`chrome_mHNex2mIL0.png`) displayed full width in a dark rounded frame with border
- Platform color dot legend below the image (YouTube red, TikTok white, Facebook blue, Instagram pink, LinkedIn blue, Bluesky sky)

### 6. Time Savings Value Prop
No changes. The before/after stats grid is kept as-is.

### 7. Pricing
No changes.

### 8. Supported Platforms
No changes. Clickable cards linking to `/platforms/<platform>`.

### 9. FAQ
No changes.

### 10. Final CTA
No changes.

### 11. Footer
No changes.

## Sections Removed
- **Twitch/Kick Import spotlight section** — demoted to feature card (already exists)
- **Stats bar** (6, ∞, AI, 24/7) — removed, replaced by Screenshot Showcase section which provides stronger visual proof

## Visual Changes Summary
| Area | Change |
|------|--------|
| Hero background | Faint radial blue/purple bloom behind headline |
| Hero | Product screenshot (scheduling UI) added below platform icons |
| Feature grid | First card full-width horizontal with platform icons on right |
| How It Works | Dashed connector line between steps on desktop |
| New section | Calendar screenshot showcase replaces Twitch/Kick + stats bar |
| Removed | Twitch/Kick dedicated section |
| Removed | Feature stats bar (6, ∞, AI, 24/7) |

## Files to Modify
- `src/app/page.tsx` — all changes are in this single file

## Images to Use
- Hero screenshot: `public/product-scheduler.png` (scheduling/configure UI — Image #1)
- Calendar screenshot: `public/product-calendar.png` (calendar view — Image #2)

Both files need to be copied to the `public/` folder before implementation. Recommended command:
```
copy "C:\Users\dbher\Documents\ShareX\Screenshots\2026-04\chrome_HfSIDVApui.png" "public\product-scheduler.png"
copy "C:\Users\dbher\Documents\ShareX\Screenshots\2026-04\chrome_mHNex2mIL0.png" "public\product-calendar.png"
```
