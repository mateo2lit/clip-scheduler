// src/components/ai-clips/SubtitleStylePicker.tsx
"use client";

import { useRef, useState } from "react";
import { SubtitleStyle, PRESETS, PRESET_LABELS } from "@/app/ai-clips/types";
import { SubtitlePreview } from "@/components/ai-clips/SubtitlePreview";

type Tab = "presets" | "font" | "effects" | "title";

// ── Color input ───────────────────────────────────────────────────────────────

function ColorInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const display = value.replace("#", "").toUpperCase().padEnd(6, "0");
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
      <div className="flex flex-col items-center justify-center gap-1.5">
        <svg className="w-6 h-6 text-white/25" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
        <span className="text-[10px] text-white/25">No captions</span>
      </div>
    );
  }

  const strokeW = Math.max(0.5, Math.round(preset.strokeWidth / 2.5));
  const baseTextStyle: React.CSSProperties = {
    fontFamily: preset.fontFamily + ", sans-serif",
    fontSize: "15px",
    fontWeight: preset.fontWeight === "Black" ? 900 : preset.fontWeight === "Bold" ? 700 : 400,
    textTransform: preset.uppercase ? "uppercase" : "none",
    WebkitTextStroke: strokeW > 0 ? `${strokeW}px ${preset.strokeColor}` : undefined,
    lineHeight: 1.3,
    paintOrder: "stroke fill" as any,
  };

  if (preset.animation === "word_highlight") {
    return (
      <p style={baseTextStyle} className="text-center px-1 leading-snug">
        <span style={{ color: preset.highlightColor }}>Caption </span>
        <span style={{ color: preset.primaryColor }}>Style</span>
      </p>
    );
  }

  return (
    <p style={{ ...baseTextStyle, color: preset.primaryColor }} className="text-center px-1 leading-snug">
      Caption Style
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
  const keys = Object.keys(PRESETS) as Array<keyof typeof PRESETS>;
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
              isSelected ? "border-violet-400" : "border-white/10 hover:border-white/30"
            }`}
          >
            <div className="bg-gradient-to-b from-[#0d0d1a] to-[#111120] h-20 flex items-center justify-center px-2">
              <PresetCardText preset={preset} />
            </div>
            <div className="py-1.5 px-2 bg-[#111116] text-center">
              <span className={`text-[11px] font-medium ${isSelected ? "text-violet-300" : "text-white/60"}`}>{PRESET_LABELS[key]}</span>
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
      <p className="text-sm font-medium text-white">Caption font</p>

      {/* Font family */}
      <select
        value={style.fontFamily}
        onChange={(e) => onUpdate("fontFamily", e.target.value as SubtitleStyle["fontFamily"])}
        className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
      >
        <option value="Montserrat" style={{ backgroundColor: "#1a1a1a", color: "white" }}>Montserrat</option>
        <option value="Oswald" style={{ backgroundColor: "#1a1a1a", color: "white" }}>Oswald</option>
        <option value="Arial" style={{ backgroundColor: "#1a1a1a", color: "white" }}>Arial</option>
      </select>

      {/* Color + size + weight */}
      <div className="space-y-1.5">
        <p className="text-xs text-white/40">Size &amp; weight</p>
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-white/10 rounded-lg overflow-hidden">
            <button
              onClick={() => onUpdate("fontSize", Math.max(8, style.fontSize - 1))}
              className="w-6 h-7 flex items-center justify-center bg-white/5 text-white/50 hover:text-white hover:bg-white/10 transition-colors text-xs"
            >▼</button>
            <NumInput value={style.fontSize} onChange={(v) => onUpdate("fontSize", v)} min={8} max={120} className="w-10 px-1 py-1 border-0 rounded-none" />
            <button
              onClick={() => onUpdate("fontSize", Math.min(120, style.fontSize + 1))}
              className="w-6 h-7 flex items-center justify-center bg-white/5 text-white/50 hover:text-white hover:bg-white/10 transition-colors text-xs"
            >▲</button>
          </div>
          <span className="text-xs text-white/40">px</span>
          <select
            value={style.fontWeight}
            onChange={(e) => onUpdate("fontWeight", e.target.value as SubtitleStyle["fontWeight"])}
            className="flex-1 bg-[#1a1a1a] border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white"
          >
            <option value="Regular" style={{ backgroundColor: "#1a1a1a", color: "white" }}>Regular</option>
            <option value="Bold" style={{ backgroundColor: "#1a1a1a", color: "white" }}>Bold</option>
            <option value="Black" style={{ backgroundColor: "#1a1a1a", color: "white" }}>Extra Bold</option>
          </select>
        </div>
      </div>

      {/* Text color */}
      <div className="space-y-1.5">
        <p className="text-xs text-white/40">Text color</p>
        <ColorInput value={style.primaryColor} onChange={(v) => onUpdate("primaryColor", v)} />
      </div>

      {/* Style toggles */}
      <div className="space-y-1.5">
        <p className="text-xs text-white/40">Style</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onUpdate("italic", !style.italic)}
            className={`px-3 py-1.5 rounded-lg text-xs border transition-colors italic font-medium ${
              style.italic ? "bg-white/15 border-white/20 text-white" : "border-white/10 text-white/40 hover:text-white/60"
            }`}
          >
            Italic
          </button>
          <button
            onClick={() => onUpdate("underline", !style.underline)}
            className={`px-3 py-1.5 rounded-lg text-xs border transition-colors underline font-medium ${
              style.underline ? "bg-white/15 border-white/20 text-white" : "border-white/10 text-white/40 hover:text-white/60"
            }`}
          >
            Underline
          </button>
          <button
            onClick={() => onUpdate("uppercase", !style.uppercase)}
            className={`px-3 py-1.5 rounded-lg text-xs border transition-colors font-medium ${
              style.uppercase ? "bg-white/15 border-white/20 text-white" : "border-white/10 text-white/40 hover:text-white/60"
            }`}
          >
            ALL CAPS
          </button>
        </div>
      </div>

      {/* Outline */}
      <div className="space-y-1.5">
        <p className="text-xs text-white/40">Outline (stroke)</p>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <ColorInput value={style.strokeColor} onChange={(v) => onUpdate("strokeColor", v)} />
            <input
              type="range" min={0} max={20} step={1}
              value={style.strokeWidth}
              onChange={(e) => onUpdate("strokeWidth", Number(e.target.value))}
              className="flex-1 accent-violet-400"
            />
            <span className="text-[11px] text-white/40 w-5 tabular-nums text-right">{style.strokeWidth}</span>
          </div>
        </div>
      </div>

      {/* Drop shadow */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-white/40">Drop shadow</p>
            <p className="text-[10px] text-white/25">Adds shadow behind text for readability</p>
          </div>
          <Toggle value={style.shadowEnabled} onChange={(v) => onUpdate("shadowEnabled", v)} />
        </div>
        {style.shadowEnabled && (
          <div className="flex items-center gap-4 ml-2">
            <div className="flex flex-col items-center gap-0.5">
              <NumInput value={style.shadowY} onChange={(v) => onUpdate("shadowY", v)} min={0} max={20} className="w-10 px-1 py-1 text-xs" />
              <span className="text-[9px] text-white/30">depth</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <NumInput value={style.shadowBlur} onChange={(v) => onUpdate("shadowBlur", v)} min={0} max={20} className="w-10 px-1 py-1 text-xs" />
              <span className="text-[9px] text-white/30">softness</span>
            </div>
          </div>
        )}
      </div>

      {/* Highlight color */}
      {style.animation === "word_highlight" && (
        <div className="space-y-1.5">
          <p className="text-xs text-white/40">Highlight color</p>
          <p className="text-[10px] text-white/25">Color of the active spoken word</p>
          <ColorInput value={style.highlightColor} onChange={(v) => onUpdate("highlightColor", v)} />
        </div>
      )}
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
          className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="word_highlight" style={{ backgroundColor: "#1a1a1a", color: "white" }}>Bounce (Word Highlight)</option>
          <option value="line" style={{ backgroundColor: "#1a1a1a", color: "white" }}>Line by Line</option>
          <option value="none" style={{ backgroundColor: "#1a1a1a", color: "white" }}>None</option>
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

// ── Title tab ─────────────────────────────────────────────────────────────────

function TitleTab({
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

  const titleEnabled = style.titleEnabled ?? true;

  return (
    <div className="space-y-4">
      {/* On/off */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-white/70 font-medium">Title card</span>
        <Toggle value={titleEnabled} onChange={(v) => onUpdate("titleEnabled", v)} />
      </div>

      {titleEnabled && (
        <>
          {/* Custom text */}
          <div className="space-y-1.5">
            <p className="text-xs text-white/40">Title text</p>
            <input
              type="text"
              value={style.titleText ?? ""}
              onChange={(e) => onUpdate("titleText", e.target.value)}
              placeholder="Leave blank to use AI-generated title"
              className="w-full bg-[#111111] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/25"
            />
          </div>

          {/* Position */}
          <div className="space-y-2">
            <p className="text-xs text-white/40">Position</p>
            <div className="flex gap-1">
              {(["top", "bottom"] as const).map((p) => (
                <button key={p} onClick={() => onUpdate("titlePosition", p)}
                  className={segBtn((style.titlePosition ?? "top") === p)}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Background */}
          <div className="space-y-2">
            <p className="text-xs text-white/40">Background</p>
            <div className="flex items-center gap-3">
              <ColorInput value={style.titleBgColor ?? "#FFFFFF"} onChange={(v) => onUpdate("titleBgColor", v)} />
              <div className="flex items-center gap-1.5 flex-1">
                <input
                  type="range" min={0} max={100}
                  value={style.titleBgOpacity ?? 100}
                  onChange={(e) => onUpdate("titleBgOpacity", Number(e.target.value))}
                  className="flex-1 accent-violet-400"
                />
                <span className="text-[11px] text-white/40 w-8 tabular-nums text-right">{style.titleBgOpacity ?? 100}%</span>
              </div>
            </div>
            <p className="text-[10px] text-white/25 ml-0.5">Set opacity to 0% to remove the background box</p>
          </div>

          {/* Font */}
          <div className="space-y-3">
            <p className="text-xs text-white/40">Font</p>
            <select
              value={style.titleFontFamily ?? "Montserrat"}
              onChange={(e) => onUpdate("titleFontFamily", e.target.value as SubtitleStyle["titleFontFamily"])}
              className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="Montserrat" style={{ backgroundColor: "#1a1a1a", color: "white" }}>Montserrat</option>
              <option value="Oswald" style={{ backgroundColor: "#1a1a1a", color: "white" }}>Oswald</option>
              <option value="Arial" style={{ backgroundColor: "#1a1a1a", color: "white" }}>Arial</option>
            </select>

            {/* Text color + size + bold */}
            <div className="space-y-1.5">
              <p className="text-xs text-white/40">Text color &amp; size</p>
              <div className="flex items-center gap-2">
                <ColorInput value={style.titleColor ?? "#000000"} onChange={(v) => onUpdate("titleColor", v)} />
                {/* Size stepper */}
                <div className="flex items-center border border-white/10 rounded-lg overflow-hidden">
                  <button
                    onClick={() => onUpdate("titleFontSize", Math.max(12, (style.titleFontSize ?? 48) - 1))}
                    className="w-6 h-7 flex items-center justify-center bg-white/5 text-white/50 hover:text-white hover:bg-white/10 transition-colors text-xs"
                  >▼</button>
                  <NumInput
                    value={style.titleFontSize ?? 48}
                    onChange={(v) => onUpdate("titleFontSize", v)}
                    min={12} max={120}
                    className="w-10 px-1 py-1 border-0 rounded-none"
                  />
                  <button
                    onClick={() => onUpdate("titleFontSize", Math.min(120, (style.titleFontSize ?? 48) + 1))}
                    className="w-6 h-7 flex items-center justify-center bg-white/5 text-white/50 hover:text-white hover:bg-white/10 transition-colors text-xs"
                  >▲</button>
                </div>
                <span className="text-xs text-white/40">px</span>
                <div className="flex items-center gap-1.5 ml-auto">
                  <Toggle value={style.titleBold ?? true} onChange={(v) => onUpdate("titleBold", v)} />
                  <span className="text-xs text-white/40">Bold</span>
                </div>
              </div>
            </div>

            {/* Title stroke/outline */}
            <div className="space-y-1.5">
              <p className="text-xs text-white/40">Outline (stroke)</p>
              <div className="flex items-center gap-2">
                <ColorInput value={style.titleStrokeColor ?? "#000000"} onChange={(v) => onUpdate("titleStrokeColor", v)} />
                <input
                  type="range" min={0} max={16} step={1}
                  value={style.titleStrokeWidth ?? 0}
                  onChange={(e) => onUpdate("titleStrokeWidth", Number(e.target.value))}
                  className="flex-1 accent-violet-400"
                />
                <span className="text-[11px] text-white/40 w-5 tabular-nums text-right">{style.titleStrokeWidth ?? 0}</span>
              </div>
            </div>
          </div>
        </>
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
    onChange({
      ...PRESETS[key as keyof typeof PRESETS],
      titleEnabled: style.titleEnabled ?? true,
      titleText: style.titleText,
      titlePosition: style.titlePosition,
      titleBg: style.titleBg,
      titleBgColor: style.titleBgColor,
      titleBgOpacity: style.titleBgOpacity,
      titleFontFamily: style.titleFontFamily,
      titleFontSize: style.titleFontSize,
      titleColor: style.titleColor,
      titleBold: style.titleBold,
    });
  }

  const tabCls = (t: Tab) =>
    `px-3 py-2.5 text-sm font-medium transition-colors ${
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
        <button className={tabCls("title")} onClick={() => setTab("title")}>
          Title
        </button>
      </div>

      <div className="p-4">
        {tab === "presets" && <PresetsTab style={style} onSelect={applyPreset} />}
        {tab === "font" && <FontTab style={style} onUpdate={update} />}
        {tab === "effects" && <EffectsTab style={style} onUpdate={update} />}
        {tab === "title" && <TitleTab style={style} onUpdate={update} />}
      </div>

      {/* Live preview strip — shows both title and caption example */}
      <div className="mx-4 mb-4 space-y-1">
        {(style.titleEnabled ?? true) && (
          <div className="relative rounded-lg bg-black/30 border border-white/10 overflow-hidden flex items-center justify-center px-3 py-1.5">
            <p
              className="text-center text-[10px] leading-tight"
              style={{
                color: style.titleColor ?? "#000000",
                fontWeight: (style.titleBold ?? true) ? 900 : 400,
                fontFamily: (style.titleFontFamily ?? "Montserrat") + ", sans-serif",
                WebkitTextStroke: (style.titleStrokeWidth ?? 0) > 0 ? `${style.titleStrokeWidth}px ${style.titleStrokeColor ?? "#000000"}` : undefined,
                background: (style.titleBg ?? true) && (style.titleBgOpacity ?? 100) > 0
                  ? `rgba(${parseInt((style.titleBgColor ?? "#ffffff").slice(1,3),16)},${parseInt((style.titleBgColor ?? "#ffffff").slice(3,5),16)},${parseInt((style.titleBgColor ?? "#ffffff").slice(5,7),16)},${(style.titleBgOpacity ?? 100)/100})`
                  : undefined,
                borderRadius: "4px",
                padding: "1px 6px",
                paintOrder: "stroke fill" as any,
              }}
            >
              {style.titleText?.trim() || "Title Preview"}
            </p>
          </div>
        )}
        {style.animation !== "none" && (
          <div className="relative h-10 rounded-lg bg-black/40 border border-white/10 overflow-hidden flex items-center justify-center">
            <SubtitlePreview style={style} preview />
          </div>
        )}
      </div>
    </div>
  );
}
