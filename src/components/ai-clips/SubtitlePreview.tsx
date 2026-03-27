// src/components/ai-clips/SubtitlePreview.tsx
"use client";

import type { CSSProperties } from "react";
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
  const buildTextShadow = () => {
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
  };

  const baseStyle: CSSProperties = {
    fontFamily: style.fontFamily + ", sans-serif",
    fontSize: `${Math.max(8, Math.round(style.fontSize * 0.3))}px`,
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
