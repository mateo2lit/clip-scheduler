// src/components/ai-clips/SubtitlePreview.tsx
"use client";

import type { CSSProperties } from "react";
import { SubtitleStyle } from "@/app/ai-clips/types";

export function SubtitlePreview({
  style,
  words,
  preview = false,
  scale: scaleProp,
  positionY,
}: {
  style: SubtitleStyle;
  words?: { word: string }[];
  preview?: boolean;
  scale?: number;
  positionY?: number;
}) {
  if (style.animation === "none") return null;

  const scale = scaleProp !== undefined ? scaleProp : preview ? 0.3 : 1;
  const fontSize = Math.max(6, Math.round(style.fontSize * scale));
  const strokeW = Math.max(0.3, style.strokeWidth * scale);

  const fontWeightNum =
    style.fontWeight === "Black" ? 900 : style.fontWeight === "Bold" ? 700 : 400;

  const posClass =
    style.position === "top"
      ? "top-2"
      : style.position === "middle"
      ? "top-1/2 -translate-y-1/2"
      : "bottom-2";

  const posStyle: CSSProperties = positionY !== undefined
    ? { top: `${positionY * 100}%`, transform: "translateY(-50%)", bottom: "auto" }
    : {};

  // Use WebkitTextStroke for clean outline (no ghost artifacts)
  // paintOrder: "stroke fill" renders stroke behind fill for readability
  const dropShadow = style.shadowEnabled
    ? `${style.shadowX * scale}px ${style.shadowY * scale}px ${style.shadowBlur * scale}px rgba(0,0,0,0.85)`
    : undefined;

  const baseStyle: CSSProperties = {
    fontFamily: style.fontFamily + ", sans-serif",
    fontSize: `${fontSize}px`,
    fontWeight: fontWeightNum,
    fontStyle: style.italic ? "italic" : "normal",
    textDecoration: style.underline ? "underline" : "none",
    textTransform: style.uppercase ? "uppercase" : "none",
    WebkitTextStroke: strokeW > 0 ? `${strokeW}px ${style.strokeColor}` : undefined,
    textShadow: dropShadow,
    lineHeight: 1.3,
    paintOrder: "stroke fill" as any,
  };

  if (style.animation === "word_highlight") {
    const displayWords = preview
      ? ["Example", "subtitle", "text"]
      : words && words.length > 0
      ? words.slice(0, style.lines === 1 ? 4 : 8).map((w) => w.word)
      : ["AI", "generated", "subtitle"];

    return (
      <div
        className={`absolute left-0 right-0 px-2 pointer-events-none text-center ${positionY !== undefined ? "" : posClass}`}
        style={posStyle}
      >
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

  const lineText = preview
    ? "Example subtitle text"
    : words && words.length > 0
    ? words.slice(0, style.lines === 1 ? 4 : 8).map((w) => w.word).join(" ")
    : "AI generated subtitle";

  return (
    <div
      className={`absolute left-0 right-0 px-2 pointer-events-none text-center ${positionY !== undefined ? "" : posClass}`}
      style={posStyle}
    >
      <p style={{ ...baseStyle, color: style.primaryColor }}>{lineText}</p>
    </div>
  );
}
