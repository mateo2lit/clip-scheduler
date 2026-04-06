// src/components/uploads/VideoOverlayPreview.tsx
"use client";

import { useMemo } from "react";
import { OverlayConfig, TitleLayer, TextLayer, ImageLayer } from "@/types/overlayBurn";

interface VideoOverlayPreviewProps {
  config: OverlayConfig;
  thumbnailUrl?: string | null;
  /** Actual video width in pixels (from HTMLVideoElement). Defaults to 1920 if unknown. */
  videoWidth?: number | null;
  /** Actual video height in pixels. Defaults to 1080 if unknown. */
  videoHeight?: number | null;
  /** Height of the preview container in px. Width is derived from aspect ratio. */
  previewHeight?: number;
}

const SAMPLE_WORDS = ["These", "are", "your", "captions"];

const FONT_STACK: Record<string, string> = {
  "Montserrat": "'Montserrat', sans-serif",
  "Oswald":     "'Oswald', sans-serif",
  "Anton":      "'Anton', sans-serif",
  "Bebas Neue": "'Bebas Neue', sans-serif",
  "Poppins":    "'Poppins', sans-serif",
  "Rubik":      "'Rubik', sans-serif",
  "Arial":      "Arial, sans-serif",
};

function hexAlpha(hex: string, opacity: number): string {
  const alpha = Math.round((opacity / 100) * 255).toString(16).padStart(2, "0");
  return hex + alpha;
}

export function VideoOverlayPreview({
  config,
  thumbnailUrl,
  videoWidth,
  videoHeight,
  previewHeight = 400,
}: VideoOverlayPreviewProps) {
  const mode = config.mode;

  // Determine play resolution (matches ASS PlayResX/PlayResY in the workflow)
  const playResX = mode === "landscape" ? (videoWidth ?? 1920) : 1080;
  const playResY = mode === "landscape" ? (videoHeight ?? 1080) : 1920;

  // Aspect ratio of the OUTPUT video
  const aspectRatio = playResX / playResY;
  const previewWidth = Math.round(previewHeight * aspectRatio);

  // Scale factor: converts ASS units → CSS pixels
  const scale = previewHeight / playResY;

  // Google Fonts to load (derive from layers + captions)
  const fontsNeeded = useMemo(() => {
    const fonts = new Set<string>();
    if (config.captions.enabled) fonts.add(config.captions.style.fontFamily);
    config.layers.forEach((l) => {
      if (l.type === "title" || l.type === "text") fonts.add(l.font);
    });
    fonts.delete("Arial");
    return Array.from(fonts);
  }, [config]);

  const googleFontsUrl = fontsNeeded.length > 0
    ? `https://fonts.googleapis.com/css2?${fontsNeeded.map(f => `family=${encodeURIComponent(f)}:wght@400;700;900`).join("&")}&display=swap`
    : null;

  return (
    <div style={{ position: "relative" }}>
      {googleFontsUrl && (
        // eslint-disable-next-line @next/next/no-page-custom-font
        <link rel="stylesheet" href={googleFontsUrl} />
      )}
      <div
        style={{
          position: "relative",
          width: previewWidth,
          height: previewHeight,
          background: "#000",
          overflow: "hidden",
          borderRadius: 8,
          flexShrink: 0,
        }}
      >
        {/* Video thumbnail background */}
        {thumbnailUrl && (
          <img
            src={thumbnailUrl}
            alt=""
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        )}

        {/* Overlay layers */}
        {config.layers.map((layer, i) => {
          if (layer.type === "title") return (
            <TitleLayerPreview key={i} layer={layer} scale={scale} playResX={playResX} playResY={playResY} />
          );
          if (layer.type === "text") return (
            <TextLayerPreview key={i} layer={layer} scale={scale} playResX={playResX} playResY={playResY} />
          );
          if (layer.type === "image") return (
            <ImageLayerPreview key={i} layer={layer} previewWidth={previewWidth} previewHeight={previewHeight} />
          );
          return null;
        })}

        {/* Caption sample */}
        {config.captions.enabled && (
          <CaptionSamplePreview style={config.captions.style} scale={scale} playResX={playResX} playResY={playResY} />
        )}
      </div>
      <p style={{ marginTop: 6, fontSize: 10, color: "rgba(255,255,255,0.3)", textAlign: "center" }}>
        Live preview — captions show sample text
      </p>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TitleLayerPreview({ layer, scale, playResX, playResY }: {
  layer: TitleLayer; scale: number; playResX: number; playResY: number;
}) {
  if (!layer.text.trim()) return null;

  const fontSize = layer.fontSize * scale;
  const marginV = 25 * scale;
  const font = FONT_STACK[layer.font] ?? "sans-serif";
  const bg = layer.background;
  const stroke = layer.stroke;

  let top: string | undefined;
  let bottom: string | undefined;
  let transform = "translateX(-50%)";

  if (layer.customY != null) {
    top = `${layer.customY * 100}%`;
    transform = "translate(-50%, -50%)";
  } else if (layer.position === "top") {
    top = `${marginV}px`;
  } else {
    bottom = `${marginV}px`;
  }

  return (
    <div style={{
      position: "absolute",
      left: "50%",
      top,
      bottom,
      transform,
      fontFamily: font,
      fontSize,
      fontWeight: layer.bold ? "900" : "400",
      color: layer.color,
      whiteSpace: "nowrap",
      padding: bg.enabled ? `${2 * scale}px ${6 * scale}px` : 0,
      background: bg.enabled ? hexAlpha(bg.color, bg.opacity) : "transparent",
      WebkitTextStroke: stroke.width > 0 ? `${stroke.width * scale}px ${stroke.color}` : undefined,
      lineHeight: 1.2,
      zIndex: 10,
    }}>
      {layer.text}
    </div>
  );
}

function TextLayerPreview({ layer, scale, playResX, playResY }: {
  layer: TextLayer; scale: number; playResX: number; playResY: number;
}) {
  if (!layer.text.trim()) return null;

  const fontSize = layer.fontSize * scale;
  const font = FONT_STACK[layer.font] ?? "sans-serif";
  const bg = layer.background;

  return (
    <div style={{
      position: "absolute",
      left: `${layer.x * 100}%`,
      top: `${layer.y * 100}%`,
      transform: "translate(-50%, -50%)",
      fontFamily: font,
      fontSize,
      fontWeight: layer.bold ? "700" : "400",
      color: layer.color,
      whiteSpace: "nowrap",
      padding: bg.enabled ? `${2 * scale}px ${5 * scale}px` : 0,
      background: bg.enabled ? hexAlpha(bg.color, bg.opacity) : "transparent",
      zIndex: 9,
    }}>
      {layer.text}
    </div>
  );
}

function ImageLayerPreview({ layer, previewWidth, previewHeight }: {
  layer: ImageLayer; previewWidth: number; previewHeight: number;
}) {
  if (!layer.publicUrl) return null;

  const imgWidth = previewWidth * layer.width;
  const left = previewWidth * layer.x;
  const top = previewHeight * layer.y;

  return (
    <img
      src={layer.publicUrl}
      alt=""
      style={{
        position: "absolute",
        left,
        top,
        width: imgWidth,
        height: "auto",
        zIndex: 8,
      }}
    />
  );
}

function CaptionSamplePreview({ style, scale, playResX, playResY }: {
  style: import("@/app/ai-clips/types").SubtitleStyle;
  scale: number;
  playResX: number;
  playResY: number;
}) {
  const font = FONT_STACK[style.fontFamily] ?? "sans-serif";
  const fontSize = style.fontSize * scale;
  const strokeWidth = style.strokeWidth * scale;
  const marginV = 30 * scale;

  let top: string | undefined;
  let bottom: string | undefined;

  if (style.customCaptionY != null) {
    top = `${style.customCaptionY * 100}%`;
  } else if (style.position === "top") {
    top = `${marginV}px`;
  } else if (style.position === "middle") {
    top = "50%";
  } else {
    bottom = `${marginV}px`;
  }

  return (
    <div style={{
      position: "absolute",
      left: "50%",
      top,
      bottom,
      transform: top === "50%" ? "translate(-50%, -50%)" : "translateX(-50%)",
      display: "flex",
      gap: `${4 * scale}px`,
      flexWrap: "wrap",
      justifyContent: "center",
      zIndex: 11,
    }}>
      {SAMPLE_WORDS.map((word, i) => (
        <span key={i} style={{
          fontFamily: font,
          fontSize,
          fontWeight: style.fontWeight === "Black" ? "900" : style.fontWeight === "Bold" ? "700" : "400",
          fontStyle: style.italic ? "italic" : "normal",
          textDecoration: style.underline ? "underline" : "none",
          textTransform: style.uppercase ? "uppercase" : "none",
          color: i === 1 ? style.highlightColor : style.primaryColor,
          WebkitTextStroke: strokeWidth > 0 ? `${strokeWidth}px ${style.strokeColor}` : undefined,
          whiteSpace: "nowrap",
        }}>
          {style.uppercase ? word.toUpperCase() : word}
        </span>
      ))}
    </div>
  );
}
