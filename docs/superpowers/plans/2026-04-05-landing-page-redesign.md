# Landing Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the landing page more professional by adding a product screenshot hero, restructuring the feature grid, adding a calendar showcase section, and removing weak/redundant sections.

**Architecture:** All changes are in `src/app/page.tsx`. No new components needed. Screenshots already copied to `public/product-scheduler.png` and `public/product-calendar.png`. Changes are surgical JSX edits made sequentially.

**Tech Stack:** Next.js 14.2, React 18, TypeScript, Tailwind CSS v4

---

### Task 1: Hero — add radial bloom and product screenshot

**Files:**
- Modify: `src/app/page.tsx` (hero section, ~lines 192–251)

- [ ] **Step 1: Add `Fragment` to React import**

Find line 3:
```tsx
import { useEffect, useState } from "react";
```
Replace with:
```tsx
import { useEffect, useState, Fragment } from "react";
```

- [ ] **Step 2: Widen hero section and reduce bottom padding**

Find:
```tsx
      <section className="relative z-10 mx-auto max-w-4xl px-6 pt-24 pb-20 text-center">
```
Replace with:
```tsx
      <section className="relative z-10 mx-auto max-w-5xl px-6 pt-24 pb-6 text-center">
```

- [ ] **Step 3: Add radial gradient bloom**

Inside the hero `<section>`, immediately before the eyebrow badge div (`<div className="inline-block rounded-full border border-white/10 bg-white/5 px-4 py-1.5...`), add:

```tsx
        {/* Radial gradient bloom */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[500px] w-[900px] rounded-full bg-[radial-gradient(ellipse_at_top,rgba(96,165,250,0.11)_0%,rgba(167,139,250,0.07)_45%,transparent_70%)] blur-3xl" />
        </div>
```

- [ ] **Step 4: Add product screenshot after platform icons**

Find the closing of the platform icons div and the end of the hero section:
```tsx
        </div>
        
      </section>
```
Replace with:
```tsx
        </div>

        {/* Product screenshot */}
        <div className="mt-14 rounded-2xl border border-white/10 bg-white/[0.02] p-2 shadow-[0_0_100px_rgba(96,165,250,0.12),0_0_50px_rgba(167,139,250,0.08)] text-left">
          <img
            src="/product-scheduler.png"
            alt="Clip Dash scheduling interface — configure platforms, accounts, and preview in one view"
            className="w-full rounded-xl"
          />
        </div>
      </section>
```

- [ ] **Step 5: Visual check**

Run `npm run dev`, open `http://localhost:3000`. Verify:
- Faint blue/purple glow visible behind the hero headline
- Product screenshot appears below the floating platform icons
- Screenshot has a subtle glowing border
- No layout breaks on mobile

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add product screenshot and radial bloom to landing page hero"
```

---

### Task 2: Feature grid — hero card full-width with platform icons

**Files:**
- Modify: `src/app/page.tsx` (features section, ~lines 253–340)

- [ ] **Step 1: Replace the features grid**

Find the entire features grid block — from:
```tsx
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            {
              icon: (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
                </svg>
              ),
              title: "6 Platforms, One Workflow",
```

...all the way to the closing `</div>` of the `.map()` block. Replace the entire block with:

```tsx
        <div className="flex flex-col gap-4">
          {/* Hero feature card — full width */}
          <div className="group rounded-2xl border border-white/10 bg-white/[0.02] p-7 hover:bg-white/[0.04] hover:border-white/20 transition-all flex flex-col lg:flex-row lg:items-center gap-8">
            <div className="flex-1">
              <div className="inline-flex rounded-xl p-3 mb-4 bg-blue-500/10 text-blue-400">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold">6 Platforms, One Workflow</h3>
              <p className="mt-2 text-sm text-white/50 leading-relaxed max-w-lg">
                Auto-publish to YouTube, TikTok, Instagram, Facebook, LinkedIn, and Bluesky from a single upload. No re-logging in, no re-uploading.
              </p>
            </div>
            <div className="flex items-center gap-5 flex-wrap justify-center lg:justify-end shrink-0">
              {[
                { color: "text-red-400",  svg: <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814ZM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg> },
                { color: "text-white/70", svg: <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg> },
                { color: "text-pink-400", svg: <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069ZM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0Zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881Z"/></svg> },
                { color: "text-blue-400", svg: <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073Z"/></svg> },
                { color: "text-blue-300", svg: <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286ZM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065Zm1.782 13.019H3.555V9h3.564v11.452ZM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003Z"/></svg> },
                { color: "text-sky-400",  svg: <svg className="w-7 h-7" viewBox="0 0 360 320" fill="currentColor"><path d="M180 142c-16.3-31.7-60.7-90.8-102-120C38 2 27.5-2 20 2 10 7.5 10 25.5 10 35V90c0 50 38 65 76 73-38 8-76 23-76 73v55c0 9.5 0 27.5 10 33 7.5 4 18 0 58-20 41.3-29.2 85.7-88.3 102-120zm0 0c16.3-31.7 60.7-90.8 102-120 40-20 50.5-24 58-20 10 5.5 10 23.5 10 33v55c0 50-38 65-76 73 38 8 76 23 76 73v55c0 9.5 0 27.5-10 33-7.5 4-18 0-58-20C240.7 230.8 196.3 171.7 180 142z"/></svg> },
              ].map((p, i) => (
                <div key={i} className={p.color}>{p.svg}</div>
              ))}
            </div>
          </div>

          {/* Remaining 5 feature cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m13.19 8.688 4.505-4.504a3 3 0 1 1 4.243 4.242l-4.504 4.505m-4.243-4.243-4.505 4.505a3 3 0 0 0 4.243 4.243l4.504-4.505m-8.747-1.414 1.414 1.414" />
                  </svg>
                ),
                title: "Import Twitch & Kick Clips by URL",
                desc: "Paste a Twitch or Kick clip link and turn it into a scheduled cross-post without manual downloading or re-uploading.",
                color: "emerald",
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                  </svg>
                ),
                title: "Multiple Accounts Per Platform",
                desc: "Connect multiple YouTube channels, TikTok accounts, or Instagram profiles and post to all of them at once.",
                color: "pink",
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                ),
                title: "AI Tag Suggestions",
                desc: "Generate platform-aware hashtags in seconds based on your title, description, and target audience.",
                color: "purple",
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
                  </svg>
                ),
                title: "Unified Comments Inbox",
                desc: "Read and reply to comments from YouTube, Instagram, Facebook, and Bluesky in one place so engagement never slips through.",
                color: "emerald",
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                  </svg>
                ),
                title: "Smart Queue Scheduling",
                desc: "Set recurring time slots for each day of the week. Add to Queue on any upload and Clip Dash fills your next open slot automatically.",
                color: "orange",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-white/10 bg-white/[0.02] p-6 hover:bg-white/[0.04] hover:border-white/20 transition-all"
              >
                <div className={`inline-flex rounded-xl p-3 mb-4 ${
                  f.color === "pink"   ? "bg-pink-500/10 text-pink-400" :
                  f.color === "purple" ? "bg-purple-500/10 text-purple-400" :
                  f.color === "orange" ? "bg-orange-500/10 text-orange-400" :
                  "bg-emerald-500/10 text-emerald-400"
                }`}>
                  {f.icon}
                </div>
                <h3 className="text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-white/50 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
```

- [ ] **Step 2: Visual check**

Verify:
- First card spans full width on desktop with platform icons on the right
- Platform icons are on a second row on mobile
- Remaining 5 cards render in a 3-col grid (3 cards row 1, 2 cards row 2)

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: hero feature card full-width with platform icons on landing page"
```

---

### Task 3: How It Works — larger badges and step arrows

**Files:**
- Modify: `src/app/page.tsx` (~lines 342–363)

- [ ] **Step 1: Replace the How It Works steps grid**

Find:
```tsx
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { step: "1", title: "Upload or import", desc: "Drop your video file or paste a Twitch/Kick clip link, then add your title, description, hashtags, and thumbnail in one place." },
            { step: "2", title: "Pick platforms and accounts", desc: "Select which platforms to post to. If you have multiple YouTube channels or TikTok accounts, choose which ones to post to — or all of them at once." },
            { step: "3", title: "Schedule and relax", desc: "Set a time, hit schedule, and walk away. No re-uploading, no re-logging in. Clip Dash posts automatically and all your comments land in one unified inbox." },
          ].map((s) => (
            <div key={s.step} className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-sm font-bold mb-5">
                {s.step}
              </div>
              <h3 className="text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-white/50 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
```

Replace with:
```tsx
        <div className="flex flex-col sm:flex-row gap-4">
          {[
            { step: "1", title: "Upload or import", desc: "Drop your video file or paste a Twitch/Kick clip link, then add your title, description, hashtags, and thumbnail in one place." },
            { step: "2", title: "Pick platforms and accounts", desc: "Select which platforms to post to. If you have multiple YouTube channels or TikTok accounts, choose which ones to post to — or all of them at once." },
            { step: "3", title: "Schedule and relax", desc: "Set a time, hit schedule, and walk away. No re-uploading, no re-logging in. Clip Dash posts automatically and all your comments land in one unified inbox." },
          ].map((s, i) => (
            <Fragment key={s.step}>
              <div className="flex-1 rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-sm font-bold mb-5 ring-4 ring-[#050505]">
                  {s.step}
                </div>
                <h3 className="text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-white/50 leading-relaxed">{s.desc}</p>
              </div>
              {i < 2 && (
                <div className="hidden sm:flex items-center justify-center shrink-0 w-6 text-white/25">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M3 10h14M11 4l6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="3 2"/>
                  </svg>
                </div>
              )}
            </Fragment>
          ))}
        </div>
```

- [ ] **Step 2: Visual check**

Verify:
- Step badges are slightly larger
- Dashed arrow icons appear between steps on desktop
- No arrows on mobile (steps stack vertically)

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: how-it-works step arrows and larger badges"
```

---

### Task 4: Add calendar screenshot showcase section

**Files:**
- Modify: `src/app/page.tsx` (insert after How It Works `</section>`, before Twitch/Kick section)

- [ ] **Step 1: Insert the new showcase section**

Find the `{/* Twitch/Kick Import */}` comment. Insert the following block immediately before it:

```tsx
      {/* Calendar Screenshot Showcase */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Your entire content calendar,<br className="hidden sm:block" /> across all platforms.
          </h2>
          <p className="mt-4 text-white/40 text-lg max-w-2xl mx-auto">
            Every scheduled post across YouTube, TikTok, Instagram, Facebook, LinkedIn, and Bluesky — visible in one view.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-2 shadow-[0_0_60px_rgba(96,165,250,0.08)]">
          <img
            src="/product-calendar.png"
            alt="Clip Dash content calendar showing a full month of scheduled posts across all platforms"
            className="w-full rounded-xl"
          />
        </div>
        <div className="mt-6 flex items-center justify-center flex-wrap gap-5 text-sm text-white/45">
          {[
            { dot: "bg-red-400",  name: "YouTube" },
            { dot: "bg-white/60", name: "TikTok" },
            { dot: "bg-blue-400", name: "Facebook" },
            { dot: "bg-pink-400", name: "Instagram" },
            { dot: "bg-blue-300", name: "LinkedIn" },
            { dot: "bg-sky-400",  name: "Bluesky" },
          ].map((p) => (
            <div key={p.name} className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full shrink-0 ${p.dot}`} />
              <span>{p.name}</span>
            </div>
          ))}
        </div>
      </section>

```

- [ ] **Step 2: Visual check**

Verify:
- Calendar screenshot appears full-width in a dark frame
- Centered headline and subtext above
- Platform color legend below
- Section sits between How It Works and the Twitch/Kick section (which will be removed in Task 5)

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add calendar screenshot showcase section"
```

---

### Task 5: Remove Twitch/Kick spotlight and stats bar

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Delete the Twitch/Kick Import section**

Find and delete the entire block from the `{/* Twitch/Kick Import */}` comment through its closing `</section>` tag. The block starts with:
```tsx
      {/* Twitch/Kick Import */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-20">
        <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 sm:p-8 lg:p-10">
```
and ends with:
```tsx
        </div>
      </section>
```
(the one containing the two-column grid with "Import clips by URL in seconds" content)

- [ ] **Step 2: Delete the Stats / Social Proof bar**

Find and delete the entire block from the `{/* Stats / Social Proof */}` comment through its closing `</section>` tag:
```tsx
      {/* Stats / Social Proof */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-16">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
```
ending at:
```tsx
        </div>
      </section>
```
(the one with the "6", "∞", "AI", "24/7" stat values)

- [ ] **Step 3: Visual check**

Scroll the full page from top to bottom and verify the section order is:
1. Nav
2. Hero (with product screenshot)
3. Features (hero card + 5 cards)
4. How It Works (with step arrows)
5. Calendar Showcase
6. Time Savings (before/after stats grid)
7. Pricing
8. Supported Platforms
9. FAQ
10. Final CTA
11. Footer

Confirm no broken layout or orphaned tags in the browser.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: remove Twitch/Kick spotlight and weak stats bar from landing page"
```
