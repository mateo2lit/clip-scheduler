// src/components/ai-clips/SubtitleStylePicker.tsx
"use client";

import { useRef, useState } from "react";
import { SubtitleStyle, PRESETS, PRESET_LABELS } from "@/app/ai-clips/types";
import { SubtitlePreview } from "@/components/ai-clips/SubtitlePreview";

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
        className="w-full bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
      >
        <option value="Montserrat" style={{ backgroundColor: "#1a1a1a", color: "white" }}>Montserrat</option>
        <option value="Oswald" style={{ backgroundColor: "#1a1a1a", color: "white" }}>Oswald</option>
        <option value="Arial" style={{ backgroundColor: "#1a1a1a", color: "white" }}>Arial</option>
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
          className="flex-1 bg-[#1a1a1a] border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white"
        >
          <option value="Regular" style={{ backgroundColor: "#1a1a1a", color: "white" }}>Regular</option>
          <option value="Bold" style={{ backgroundColor: "#1a1a1a", color: "white" }}>Bold</option>
          <option value="Black" style={{ backgroundColor: "#1a1a1a", color: "white" }}>Black</option>
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
        <p className="text-xs text-white/40">AI keywords highlighter</p>
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
    onChange({ ...PRESETS[key as keyof typeof PRESETS] });
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

      {/* Live preview strip */}
      {style.animation !== "none" && (
        <div className="mx-4 mb-4 relative h-10 rounded-lg bg-black/40 border border-white/10 overflow-hidden flex items-center justify-center">
          <SubtitlePreview style={style} preview />
        </div>
      )}
    </div>
  );
}
