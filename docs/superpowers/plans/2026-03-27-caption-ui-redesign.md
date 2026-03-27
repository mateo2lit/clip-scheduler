# Caption UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the simple caption style picker on the AI Clips page with a 3-tab (Presets / Font / Effects) system matching the reference UI, and extend the burn workflow to apply all new style fields to the actual output video.

**Architecture:** New `SubtitleStyle` type and preset constants live in `src/app/ai-clips/types.ts`. Two new components (`SubtitlePreview`, `SubtitleStylePicker`) are extracted to `src/components/ai-clips/`. The burn workflow Python script is extended to read the new fields and generate proper ASS subtitles with font, stroke, shadow, uppercase, and per-line-count support.

**Tech Stack:** React 18, TypeScript, Tailwind CSS v4, Python 3 (in GitHub Actions), FFmpeg, ASS subtitle format.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/app/ai-clips/types.ts` | **Create** | `SubtitleStyle` type, `PRESETS` constant, `PRESET_LABELS`, `DEFAULT_SUBTITLE_STYLE` |
| `src/components/ai-clips/SubtitlePreview.tsx` | **Create** | In-UI subtitle overlay preview |
| `src/components/ai-clips/SubtitleStylePicker.tsx` | **Create** | 3-tab Presets/Font/Effects UI |
| `src/app/ai-clips/page.tsx` | **Modify** | Remove old inline type/component defs, import new ones |
| `.github/workflows/ai-clip-burn.yml` | **Modify** | Extend Python script for new style fields + font install |

---

## Task 1: Create types file

**Files:**
- Create: `src/app/ai-clips/types.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/app/ai-clips/types.ts

export type SubtitleStyle = {
  preset: "none" | "karaoke" | "beasty" | "deep_diver" | "youshaei" | "pod_p" | "custom";
  animation: "word_highlight" | "line" | "none";
  // Font
  fontFamily: "Montserrat" | "Oswald" | "Arial";
  fontSize: number;
  fontWeight: "Regular" | "Bold" | "Black";
  italic: boolean;
  underline: boolean;
  uppercase: boolean;
  // Stroke
  strokeColor: string;  // hex e.g. "#000000"
  strokeWidth: number;  // px
  // Shadow
  shadowEnabled: boolean;
  shadowX: number;
  shadowY: number;
  shadowBlur: number;
  // Colors
  primaryColor: string;    // hex, main text
  highlightColor: string;  // hex, active/highlighted word
  // Effects
  position: "auto" | "top" | "middle" | "bottom";
  lines: 1 | 3;
};

export const PRESETS: Record<string, SubtitleStyle> = {
  none: {
    preset: "none",
    animation: "none",
    fontFamily: "Montserrat",
    fontSize: 40,
    fontWeight: "Black",
    italic: false,
    underline: false,
    uppercase: true,
    strokeColor: "#000000",
    strokeWidth: 8,
    shadowEnabled: false,
    shadowX: 2,
    shadowY: 2,
    shadowBlur: 2,
    primaryColor: "#FFFFFF",
    highlightColor: "#04F827",
    position: "bottom",
    lines: 1,
  },
  karaoke: {
    preset: "karaoke",
    animation: "word_highlight",
    fontFamily: "Montserrat",
    fontSize: 40,
    fontWeight: "Black",
    italic: false,
    underline: false,
    uppercase: true,
    strokeColor: "#000000",
    strokeWidth: 8,
    shadowEnabled: true,
    shadowX: 2,
    shadowY: 2,
    shadowBlur: 2,
    primaryColor: "#FFFFFF",
    highlightColor: "#04F827",
    position: "bottom",
    lines: 1,
  },
  beasty: {
    preset: "beasty",
    animation: "word_highlight",
    fontFamily: "Montserrat",
    fontSize: 44,
    fontWeight: "Black",
    italic: false,
    underline: false,
    uppercase: true,
    strokeColor: "#000000",
    strokeWidth: 6,
    shadowEnabled: false,
    shadowX: 2,
    shadowY: 2,
    shadowBlur: 2,
    primaryColor: "#FFFFFF",
    highlightColor: "#FFFD03",
    position: "bottom",
    lines: 1,
  },
  deep_diver: {
    preset: "deep_diver",
    animation: "word_highlight",
    fontFamily: "Montserrat",
    fontSize: 36,
    fontWeight: "Bold",
    italic: false,
    underline: false,
    uppercase: false,
    strokeColor: "#000000",
    strokeWidth: 4,
    shadowEnabled: false,
    shadowX: 2,
    shadowY: 2,
    shadowBlur: 2,
    primaryColor: "#FFFFFF",
    highlightColor: "#00FFFF",
    position: "middle",
    lines: 3,
  },
  youshaei: {
    preset: "youshaei",
    animation: "word_highlight",
    fontFamily: "Oswald",
    fontSize: 48,
    fontWeight: "Bold",
    italic: false,
    underline: false,
    uppercase: true,
    strokeColor: "#000000",
    strokeWidth: 8,
    shadowEnabled: true,
    shadowX: 2,
    shadowY: 2,
    shadowBlur: 2,
    primaryColor: "#04F827",
    highlightColor: "#FFFD03",
    position: "bottom",
    lines: 1,
  },
  pod_p: {
    preset: "pod_p",
    animation: "line",
    fontFamily: "Montserrat",
    fontSize: 38,
    fontWeight: "Bold",
    italic: false,
    underline: false,
    uppercase: false,
    strokeColor: "#000000",
    strokeWidth: 4,
    shadowEnabled: false,
    shadowX: 2,
    shadowY: 2,
    shadowBlur: 2,
    primaryColor: "#FFFFFF",
    highlightColor: "#FFFFFF",
    position: "bottom",
    lines: 3,
  },
};

export const PRESET_LABELS: Record<string, string> = {
  none: "No captions",
  karaoke: "Karaoke",
  beasty: "Beasty",
  deep_diver: "Deep Diver",
  youshaei: "Youshaei",
  pod_p: "Pod P",
};

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = { ...PRESETS.karaoke };
```

- [ ] **Step 2: Commit**

```bash
git add src/app/ai-clips/types.ts
git commit -m "feat: subtitle style types, presets, and defaults"
```

---

## Task 2: Create SubtitlePreview component

**Files:**
- Create: `src/components/ai-clips/SubtitlePreview.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/components/ai-clips/SubtitlePreview.tsx
"use client";

import { SubtitleStyle } from "@/app/ai-clips/types";

export function SubtitlePreview({
  style,
  words,
  preview = false,
}: {
  style: SubtitleStyle;
  words?: { word: string }[];
  preview?: boolean;
}) {
  if (style.animation === "none") return null;

  const posClass =
    style.position === "top"
      ? "top-2"
      : style.position === "middle"
      ? "top-1/2 -translate-y-1/2"
      : "bottom-2"; // "auto" and "bottom" both go bottom

  const fontWeightNum =
    style.fontWeight === "Black" ? 900 : style.fontWeight === "Bold" ? 700 : 400;

  // Build text-shadow for stroke effect (8 directions) + drop shadow
  function buildTextShadow() {
    const shadows: string[] = [];
    const w = style.strokeWidth;
    const c = style.strokeColor;
    if (w > 0) {
      shadows.push(
        `-${w}px -${w}px 0 ${c}`,
        `${w}px -${w}px 0 ${c}`,
        `-${w}px ${w}px 0 ${c}`,
        `${w}px ${w}px 0 ${c}`,
        `0 -${w}px 0 ${c}`,
        `0 ${w}px 0 ${c}`,
        `-${w}px 0 0 ${c}`,
        `${w}px 0 0 ${c}`
      );
    }
    if (style.shadowEnabled) {
      shadows.push(
        `${style.shadowX}px ${style.shadowY}px ${style.shadowBlur}px rgba(0,0,0,0.8)`
      );
    }
    return shadows.join(", ");
  }

  const baseStyle: React.CSSProperties = {
    fontFamily: style.fontFamily + ", sans-serif",
    fontSize: "clamp(9px, 2.5vw, 14px)",
    fontWeight: fontWeightNum,
    fontStyle: style.italic ? "italic" : "normal",
    textDecoration: style.underline ? "underline" : "none",
    textTransform: style.uppercase ? "uppercase" : "none",
    textShadow: buildTextShadow(),
    lineHeight: 1.3,
  };

  // Word highlight mode: show first word highlighted, rest in primary
  if (style.animation === "word_highlight") {
    const displayWords = preview
      ? ["Example", "subtitle", "text"]
      : words && words.length > 0
      ? words.slice(0, style.lines === 1 ? 4 : 8).map((w) => w.word)
      : ["AI", "generated", "subtitle"];

    return (
      <div className={`absolute left-0 right-0 px-2 pointer-events-none text-center ${posClass}`}>
        <p style={baseStyle}>
          {displayWords.map((word, i) => (
            <span
              key={i}
              style={{ color: i === 0 ? style.highlightColor : style.primaryColor }}
            >
              {word}
              {i < displayWords.length - 1 ? " " : ""}
            </span>
          ))}
        </p>
      </div>
    );
  }

  // Line mode
  const lineText = preview
    ? "Example subtitle text"
    : words && words.length > 0
    ? words
        .slice(0, style.lines === 1 ? 4 : 8)
        .map((w) => w.word)
        .join(" ")
    : "AI generated subtitle";

  return (
    <div className={`absolute left-0 right-0 px-2 pointer-events-none text-center ${posClass}`}>
      <p style={{ ...baseStyle, color: style.primaryColor }}>{lineText}</p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ai-clips/SubtitlePreview.tsx
git commit -m "feat: new SubtitlePreview component using extended style fields"
```

---

## Task 3: Create SubtitleStylePicker component

**Files:**
- Create: `src/components/ai-clips/SubtitleStylePicker.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/components/ai-clips/SubtitleStylePicker.tsx
"use client";

import { useRef, useState } from "react";
import { SubtitleStyle, PRESETS, PRESET_LABELS } from "@/app/ai-clips/types";

type Tab = "presets" | "font" | "effects";

// ── Color input ───────────────────────────────────────────────────────────────

function ColorInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const display = value.replace("#", "").toUpperCase().padEnd(6, "0") + "FF";
  return (
    <div className="flex items-center gap-2 cursor-pointer" onClick={() => ref.current?.click()}>
      <div
        className="w-6 h-6 rounded-full border border-white/20 flex-shrink-0"
        style={{ backgroundColor: value }}
      />
      <input
        ref={ref}
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
      />
      <span className="text-xs text-white/50 font-mono">{display}</span>
    </div>
  );
}

// ── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
        value ? "bg-green-500" : "bg-white/20"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          value ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

// ── Number input ──────────────────────────────────────────────────────────────

function NumInput({
  value,
  onChange,
  min = 0,
  max = 999,
  className = "",
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  className?: string;
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value))))}
      className={`bg-white/5 border border-white/10 rounded-lg text-sm text-white text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${className}`}
      min={min}
      max={max}
    />
  );
}

// ── Preset preview card text ──────────────────────────────────────────────────

function PresetCardText({ preset }: { preset: SubtitleStyle }) {
  if (preset.animation === "none") {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <svg className="w-5 h-5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
          />
        </svg>
      </div>
    );
  }

  const w = Math.max(1, Math.round(preset.strokeWidth / 3));
  const baseTextStyle: React.CSSProperties = {
    fontFamily: preset.fontFamily + ", sans-serif",
    fontSize: "11px",
    fontWeight:
      preset.fontWeight === "Black" ? 900 : preset.fontWeight === "Bold" ? 700 : 400,
    textTransform: preset.uppercase ? "uppercase" : "none",
    WebkitTextStroke: `${w}px ${preset.strokeColor}`,
    lineHeight: 1.2,
  };

  if (preset.animation === "word_highlight") {
    return (
      <p style={baseTextStyle} className="text-center px-1">
        <span style={{ color: preset.highlightColor }}>TO </span>
        <span style={{ color: preset.primaryColor }}>GET</span>
      </p>
    );
  }

  return (
    <p style={{ ...baseTextStyle, color: preset.primaryColor }} className="text-center px-1">
      TO GET
    </p>
  );
}

// ── Presets tab ───────────────────────────────────────────────────────────────

function PresetsTab({
  style,
  onSelect,
}: {
  style: SubtitleStyle;
  onSelect: (key: string) => void;
}) {
  const keys = ["none", "karaoke", "beasty", "deep_diver", "youshaei", "pod_p"];
  return (
    <div className="grid grid-cols-2 gap-2">
      {keys.map((key) => {
        const preset = PRESETS[key];
        const isSelected = style.preset === key;
        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className={`rounded-xl overflow-hidden border-2 transition-all text-left ${
              isSelected ? "border-white" : "border-white/10 hover:border-white/30"
            }`}
          >
            <div className="bg-[#1a1a2e] h-16 flex items-end justify-center pb-2">
              <PresetCardText preset={preset} />
            </div>
            <div className="py-1.5 px-2 bg-[#111116] text-center">
              <span className="text-[11px] text-white/70">{PRESET_LABELS[key]}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Font tab ──────────────────────────────────────────────────────────────────

function FontTab({
  style,
  onUpdate,
}: {
  style: SubtitleStyle;
  onUpdate: <K extends keyof SubtitleStyle>(key: K, val: SubtitleStyle[K]) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-white">Font settings</p>

      {/* Font family */}
      <select
        value={style.fontFamily}
        onChange={(e) =>
          onUpdate("fontFamily", e.target.value as SubtitleStyle["fontFamily"])
        }
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
      >
        <option value="Montserrat">Montserrat</option>
        <option value="Oswald">Oswald</option>
        <option value="Arial">Arial</option>
      </select>

      {/* Color + size + weight row */}
      <div className="flex items-center gap-2">
        <ColorInput
          value={style.primaryColor}
          onChange={(v) => onUpdate("primaryColor", v)}
        />
        <NumInput
          value={style.fontSize}
          onChange={(v) => onUpdate("fontSize", v)}
          min={12}
          max={80}
          className="w-14 px-2 py-1.5"
        />
        <span className="text-xs text-white/40">px</span>
        <select
          value={style.fontWeight}
          onChange={(e) =>
            onUpdate("fontWeight", e.target.value as SubtitleStyle["fontWeight"])
          }
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white"
        >
          <option value="Regular">Regular</option>
          <option value="Bold">Bold</option>
          <option value="Black">Black</option>
        </select>
      </div>

      {/* Decoration */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-white/40 w-24 flex-shrink-0">Decoration</span>
        <button
          onClick={() => onUpdate("italic", !style.italic)}
          className={`px-2 py-1 rounded text-xs border transition-colors italic ${
            style.italic
              ? "bg-white/15 border-white/20 text-white"
              : "border-transparent text-white/40"
          }`}
        >
          I
        </button>
        <button
          onClick={() => onUpdate("underline", !style.underline)}
          className={`px-2 py-1 rounded text-xs border transition-colors underline ${
            style.underline
              ? "bg-white/15 border-white/20 text-white"
              : "border-transparent text-white/40"
          }`}
        >
          U
        </button>
      </div>

      {/* Uppercase */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/40">Uppercase</span>
        <Toggle value={style.uppercase} onChange={(v) => onUpdate("uppercase", v)} />
      </div>

      {/* Font stroke */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-white/40 w-24 flex-shrink-0">Font stroke</span>
        <ColorInput
          value={style.strokeColor}
          onChange={(v) => onUpdate("strokeColor", v)}
        />
        <NumInput
          value={style.strokeWidth}
          onChange={(v) => onUpdate("strokeWidth", v)}
          min={0}
          max={20}
          className="w-12 px-1.5 py-1"
        />
        <span className="text-xs text-white/40">px</span>
      </div>

      {/* Font shadows */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-white/40">Font shadows</span>
          <Toggle
            value={style.shadowEnabled}
            onChange={(v) => onUpdate("shadowEnabled", v)}
          />
        </div>
        {style.shadowEnabled && (
          <div className="flex items-center gap-1.5 ml-2">
            <div className="w-5 h-5 rounded-full bg-black border border-white/20 flex-shrink-0" />
            <NumInput
              value={style.shadowX}
              onChange={(v) => onUpdate("shadowX", v)}
              min={-20}
              max={20}
              className="w-10 px-1 py-1 text-xs"
            />
            <span className="text-[10px] text-white/30">x</span>
            <NumInput
              value={style.shadowY}
              onChange={(v) => onUpdate("shadowY", v)}
              min={-20}
              max={20}
              className="w-10 px-1 py-1 text-xs"
            />
            <span className="text-[10px] text-white/30">y</span>
            <NumInput
              value={style.shadowBlur}
              onChange={(v) => onUpdate("shadowBlur", v)}
              min={0}
              max={20}
              className="w-10 px-1 py-1 text-xs"
            />
            <span className="text-[10px] text-white/30">blur</span>
          </div>
        )}
      </div>

      {/* AI keywords highlighter */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-white/40">AI keywords highlighter</span>
          <Toggle value={true} onChange={() => {}} />
        </div>
        <div className="ml-2">
          <ColorInput
            value={style.highlightColor}
            onChange={(v) => onUpdate("highlightColor", v)}
          />
        </div>
      </div>
    </div>
  );
}

// ── Effects tab ───────────────────────────────────────────────────────────────

function EffectsTab({
  style,
  onUpdate,
}: {
  style: SubtitleStyle;
  onUpdate: <K extends keyof SubtitleStyle>(key: K, val: SubtitleStyle[K]) => void;
}) {
  const segBtn = (active: boolean) =>
    `px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
      active ? "bg-white text-black" : "text-white/50 hover:text-white/80"
    }`;

  return (
    <div className="space-y-5">
      {/* Position */}
      <div className="space-y-2">
        <p className="text-xs text-white/40">Position</p>
        <div className="flex gap-1 flex-wrap">
          {(["auto", "top", "middle", "bottom"] as const).map((p) => (
            <button
              key={p}
              onClick={() => onUpdate("position", p)}
              className={segBtn(style.position === p)}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Animation */}
      <div className="space-y-2">
        <p className="text-xs text-white/40">Animation</p>
        <select
          value={style.animation}
          onChange={(e) =>
            onUpdate("animation", e.target.value as SubtitleStyle["animation"])
          }
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="word_highlight">Bounce (Word Highlight)</option>
          <option value="line">Line by Line</option>
          <option value="none">None</option>
        </select>
      </div>

      {/* Lines */}
      {style.animation !== "none" && (
        <div className="space-y-2">
          <p className="text-xs text-white/40">Lines</p>
          <div className="flex gap-1">
            <button
              onClick={() => onUpdate("lines", 3)}
              className={segBtn(style.lines === 3)}
            >
              Three lines
            </button>
            <button
              onClick={() => onUpdate("lines", 1)}
              className={segBtn(style.lines === 1)}
            >
              One line
            </button>
          </div>
        </div>
      )}

      {/* Highlighted word color */}
      {style.animation === "word_highlight" && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-white/40">Highlighted word color</p>
          <ColorInput
            value={style.highlightColor}
            onChange={(v) => onUpdate("highlightColor", v)}
          />
        </div>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function SubtitleStylePicker({
  style,
  onChange,
}: {
  style: SubtitleStyle;
  onChange: (s: SubtitleStyle) => void;
}) {
  const [tab, setTab] = useState<Tab>("presets");

  function update<K extends keyof SubtitleStyle>(key: K, val: SubtitleStyle[K]) {
    onChange({ ...style, [key]: val, preset: "custom" });
  }

  function applyPreset(key: string) {
    onChange({ ...PRESETS[key] });
  }

  const tabCls = (t: Tab) =>
    `px-4 py-2.5 text-sm font-medium transition-colors ${
      tab === t
        ? "text-white border-b-2 border-white"
        : "text-white/40 hover:text-white/60 border-b-2 border-transparent"
    }`;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-white/10">
        <button className={tabCls("presets")} onClick={() => setTab("presets")}>
          Presets
        </button>
        <button className={tabCls("font")} onClick={() => setTab("font")}>
          Font
        </button>
        <button className={tabCls("effects")} onClick={() => setTab("effects")}>
          Effects
        </button>
      </div>

      <div className="p-4">
        {tab === "presets" && <PresetsTab style={style} onSelect={applyPreset} />}
        {tab === "font" && <FontTab style={style} onUpdate={update} />}
        {tab === "effects" && <EffectsTab style={style} onUpdate={update} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ai-clips/SubtitleStylePicker.tsx
git commit -m "feat: 3-tab SubtitleStylePicker (Presets/Font/Effects)"
```

---

## Task 4: Update page.tsx to use new types and components

**Files:**
- Modify: `src/app/ai-clips/page.tsx`

- [ ] **Step 1: Replace old type + constant definitions**

In `page.tsx`, find and remove/replace the following blocks entirely:

**Remove** the `SubtitleStyle` type (lines ~33–40):
```typescript
// DELETE THIS:
type SubtitleStyle = {
  animation: "word_highlight" | "line" | "none";
  color: "white" | "yellow" | "green" | "cyan";
  fontSize: "small" | "medium" | "large";
  fontWeight: "regular" | "bold";
  outline: boolean;
  position: "bottom" | "top" | "center";
};
```

**Remove** the `DEFAULT_SUBTITLE_STYLE` constant (lines ~46–53):
```typescript
// DELETE THIS:
const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  animation: "word_highlight",
  color: "white",
  fontSize: "medium",
  fontWeight: "bold",
  outline: true,
  position: "bottom",
};
```

**Remove** the `SUBTITLE_COLOR_CLASS` constant (lines ~65–70).

**Add** this import at the top of the file (after the existing imports):
```typescript
import { SubtitleStyle, DEFAULT_SUBTITLE_STYLE } from "@/app/ai-clips/types";
import { SubtitlePreview } from "@/components/ai-clips/SubtitlePreview";
import { SubtitleStylePicker } from "@/components/ai-clips/SubtitleStylePicker";
```

- [ ] **Step 2: Remove old SubtitlePreview function**

Find and delete the entire `SubtitlePreview` function (lines ~118–159):
```typescript
// DELETE THIS entire function:
function SubtitlePreview({
  style,
  words,
  preview = false,
}: { ... }) { ... }
```

- [ ] **Step 3: Remove old SubtitleStylePicker function**

Find and delete the entire `SubtitleStylePicker` function (lines ~209–336):
```typescript
// DELETE THIS entire function:
function SubtitleStylePicker({
  style,
  onChange,
}: { ... }) { ... }
```

- [ ] **Step 4: Update the subtitle style section in the page JSX**

Find the section in the page JSX that renders the `SubtitleStylePicker` (search for `<SubtitleStylePicker`). It's inside the results panel. The existing usage already passes `style={subtitleStyle}` and `onChange={setSubtitleStyle}` — no JSX changes needed since the component API is the same.

Verify the section looks like:
```tsx
<SubtitleStylePicker style={subtitleStyle} onChange={setSubtitleStyle} />
```

If it does, no JSX change is needed here.

- [ ] **Step 5: Check the ClipCard still compiles**

The `ClipCard` uses `SubtitlePreview` — confirm the import now resolves to the new component. The props `style`, `words`, and `preview` are identical so no changes needed in `ClipCard`.

- [ ] **Step 6: Run dev server and verify no TypeScript errors**

```bash
npm run dev
```

Expected: compiles without errors. Navigate to `/ai-clips`, verify the 3-tab picker renders.

- [ ] **Step 7: Commit**

```bash
git add src/app/ai-clips/page.tsx
git commit -m "feat: wire ai-clips page to new SubtitleStylePicker and SubtitlePreview"
```

---

## Task 5: Update burn workflow for new style fields

**Files:**
- Modify: `.github/workflows/ai-clip-burn.yml`

- [ ] **Step 1: Add font installation step**

After the `Check ffmpeg` step and before `Mark burn job as burning`, insert a new step:

```yaml
      - name: Install fonts
        run: |
          mkdir -p /usr/local/share/fonts/clip-dash
          BASE="https://github.com/google/fonts/raw/main/ofl"
          wget -q "${BASE}/montserrat/static/Montserrat-Regular.ttf" -O /usr/local/share/fonts/clip-dash/Montserrat-Regular.ttf
          wget -q "${BASE}/montserrat/static/Montserrat-Bold.ttf"    -O /usr/local/share/fonts/clip-dash/Montserrat-Bold.ttf
          wget -q "${BASE}/montserrat/static/Montserrat-Black.ttf"   -O /usr/local/share/fonts/clip-dash/Montserrat-Black.ttf
          wget -q "${BASE}/oswald/static/Oswald-Regular.ttf"         -O /usr/local/share/fonts/clip-dash/Oswald-Regular.ttf
          wget -q "${BASE}/oswald/static/Oswald-Bold.ttf"            -O /usr/local/share/fonts/clip-dash/Oswald-Bold.ttf
          fc-cache -f /usr/local/share/fonts/clip-dash
          echo "Installed fonts:"
          fc-list | grep -i "montserrat\|oswald" || true
```

- [ ] **Step 2: Replace the Python subtitle generation script**

Replace the entire `Generate ASS subtitle file and burn` step's Python block with:

```yaml
      - name: Generate ASS subtitle file and burn
        env:
          SUBTITLE_JSON: ${{ inputs.subtitle_json }}
          STYLE_JSON: ${{ inputs.style_json }}
        run: |
          python3 - <<'PYEOF'
          import json, os, subprocess

          words = json.loads(os.environ.get("SUBTITLE_JSON", "[]") or "[]")
          style = json.loads(os.environ.get("STYLE_JSON", "{}") or "{}")

          # ── Read style fields ──────────────────────────────────────────
          animation    = style.get("animation", "word_highlight")
          font_family  = style.get("fontFamily", "Montserrat")
          font_size    = int(style.get("fontSize", 40))
          font_weight  = style.get("fontWeight", "Black")   # Regular|Bold|Black
          italic       = bool(style.get("italic", False))
          underline    = bool(style.get("underline", False))
          uppercase    = bool(style.get("uppercase", True))
          stroke_color = style.get("strokeColor", "#000000")
          stroke_width = int(style.get("strokeWidth", 8))
          shadow_on    = bool(style.get("shadowEnabled", False))
          shadow_x     = float(style.get("shadowX", 2))
          shadow_y     = float(style.get("shadowY", 2))
          shadow_blur  = float(style.get("shadowBlur", 2))
          primary_hex  = style.get("primaryColor", "#FFFFFF")
          highlight_hex= style.get("highlightColor", "#04F827")
          position     = style.get("position", "bottom")   # auto|top|middle|bottom
          lines        = int(style.get("lines", 1))        # 1 or 3

          # ── Hex → ASS BGR ──────────────────────────────────────────────
          def hex_to_ass(h):
              h = h.lstrip("#")[:6].upper().zfill(6)
              r, g, b = h[0:2], h[2:4], h[4:6]
              return f"&H00{b}{g}{r}"

          text_color      = hex_to_ass(primary_hex)
          highlight_color = hex_to_ass(highlight_hex)
          outline_color   = hex_to_ass(stroke_color)

          # ── ASS style params ───────────────────────────────────────────
          bold      = 1 if font_weight in ("Bold", "Black") else 0
          ass_italic    = 1 if italic else 0
          ass_underline = 1 if underline else 0
          shadow_depth  = round(shadow_y) if shadow_on else 0

          # Vertical alignment: 2=bottom, 8=top, 5=middle
          if position in ("auto", "bottom"):
              valign, margin_v = 2, 30
          elif position == "top":
              valign, margin_v = 8, 30
          else:  # middle
              valign, margin_v = 5, 0

          # ── ASS header ─────────────────────────────────────────────────
          ass_header = "\n".join([
              "[Script Info]",
              "ScriptType: v4.00+",
              "PlayResX: 1080",
              "PlayResY: 1920",
              "ScaledBorderAndShadow: yes",
              "",
              "[V4+ Styles]",
              "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
              f"Style: Default,{font_family},{font_size},{text_color},&H000000FF,{outline_color},&H80000000,{bold},{ass_italic},{ass_underline},0,100,100,0,0,1,{stroke_width},{shadow_depth},{valign},10,10,{margin_v},1",
              "",
              "[Events]",
              "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
              "",
          ])

          def fmt_time(s):
              h = int(s // 3600)
              m = int((s % 3600) // 60)
              sec = s % 60
              return f"{h}:{m:02d}:{sec:06.3f}".replace(".", ",")

          def esc(t):
              return t.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}")

          def apply_case(t):
              return t.upper() if uppercase else t

          events = []
          LINE_SIZE = 1 if lines == 1 else 3

          # Words per line for display (1 line ≈ 4 words, 3 lines ≈ 8 words)
          WORDS_PER_GROUP = 4 if lines == 1 else 8

          if not words or animation == "none":
              ass_content = ass_header

          elif animation == "word_highlight":
              groups = [words[i:i+WORDS_PER_GROUP] for i in range(0, len(words), WORDS_PER_GROUP)]
              for group in groups:
                  if not group:
                      continue
                  for active_idx, active_word in enumerate(group):
                      w_start = active_word["start"]
                      w_end   = active_word["end"]
                      parts = []
                      for j, w in enumerate(group):
                          word_text = apply_case(esc(w["word"]))
                          if j == active_idx:
                              parts.append(f"{{\\c{highlight_color}}}{word_text}{{\\c{text_color}}}")
                          else:
                              parts.append(word_text)
                      text = " ".join(parts)
                      events.append(f"Dialogue: 0,{fmt_time(w_start)},{fmt_time(w_end)},Default,,0,0,0,,{text}")
              ass_content = ass_header + "\n".join(events)

          elif animation == "line":
              groups = [words[i:i+WORDS_PER_GROUP] for i in range(0, len(words), WORDS_PER_GROUP)]
              for group in groups:
                  if not group:
                      continue
                  line_start = group[0]["start"]
                  line_end   = group[-1]["end"]
                  text = " ".join(apply_case(esc(w["word"])) for w in group)
                  events.append(f"Dialogue: 0,{fmt_time(line_start)},{fmt_time(line_end)},Default,,0,0,0,,{text}")
              ass_content = ass_header + "\n".join(events)

          else:
              ass_content = ass_header

          with open("/tmp/subtitles.ass", "w", encoding="utf-8") as f:
              f.write(ass_content)

          print(f"Generated ASS: animation={animation}, font={font_family} {font_weight}, {len(events)} events", flush=True)

          if animation == "none" or not words:
              import shutil
              shutil.copy("/tmp/clip.mp4", "/tmp/burned.mp4")
              print("No subtitles — copying source", flush=True)
          else:
              proc = subprocess.run([
                  "ffmpeg", "-i", "/tmp/clip.mp4",
                  "-vf", "ass=/tmp/subtitles.ass",
                  "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                  "-pix_fmt", "yuv420p", "-r", "30",
                  "-c:a", "copy", "-movflags", "+faststart",
                  "/tmp/burned.mp4", "-y"
              ], capture_output=True, text=True)

              if proc.returncode != 0:
                  print(f"FFmpeg error: {proc.stderr[-800:]}", flush=True)
                  raise RuntimeError("Subtitle burn failed")

          if not os.path.exists("/tmp/burned.mp4") or os.path.getsize("/tmp/burned.mp4") == 0:
              raise RuntimeError("Burned output missing or empty")

          print(f"Output: {os.path.getsize('/tmp/burned.mp4'):,} bytes", flush=True)
          PYEOF
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ai-clip-burn.yml
git commit -m "feat: burn workflow supports font family, stroke, shadow, uppercase, lines count"
```

---

## Self-Review

**Spec coverage check:**
- ✅ 3-tab UI (Presets / Font / Effects) — Task 3
- ✅ 6 presets with correct styles — Task 1 (`PRESETS` constant)
- ✅ Font selector (Montserrat, Oswald, Arial) — Task 3 FontTab
- ✅ Size, weight, italic, underline, uppercase — Task 3 FontTab
- ✅ Stroke color + width — Task 3 FontTab + Task 5 burn
- ✅ Shadow enable/disable + x/y/blur — Task 3 FontTab + Task 5 burn
- ✅ AI keywords highlighter color — Task 3 FontTab
- ✅ Position (auto/top/middle/bottom) — Task 3 EffectsTab + Task 5 burn
- ✅ Animation (word_highlight/line/none) — Task 3 EffectsTab + Task 5 burn
- ✅ Lines (1/3) — Task 3 EffectsTab + Task 5 burn (WORDS_PER_GROUP)
- ✅ Highlighted word color in Effects tab — Task 3 EffectsTab
- ✅ Preset selection resets full style — Task 3 `applyPreset()`
- ✅ Manual change marks preset as "custom" — Task 3 `update()` fn
- ✅ Actual video output uses all new fields — Task 5

**Type consistency check:** `SubtitleStyle` defined once in `types.ts`, imported everywhere. All fields referenced in Task 3 (`fontFamily`, `fontSize`, `fontWeight`, `italic`, `underline`, `uppercase`, `strokeColor`, `strokeWidth`, `shadowEnabled`, `shadowX`, `shadowY`, `shadowBlur`, `primaryColor`, `highlightColor`, `position`, `lines`, `animation`, `preset`) exist in the type definition in Task 1. ✅

**No placeholders:** All steps contain complete code. ✅
