// src/components/uploads/VideoOverlayPreview.tsx
"use client";

import { useMemo, useRef } from "react";
import { OverlayConfig, OverlayLayer, TitleLayer, TextLayer, ImageLayer } from "@/types/overlayBurn";

interface VideoOverlayPreviewProps {
  config: OverlayConfig;
  thumbnailUrl?: string | null;
  /** Actual video width in pixels. Defaults to 1920 if unknown. */
  videoWidth?: number | null;
  /** Actual video height in pixels. Defaults to 1080 if unknown. */
  videoHeight?: number | null;
  /** Height of the preview container in px. Width is derived from aspect ratio. */
  previewHeight?: number;
  /** When provided, text/image layers become draggable and images get a resize handle. */
  onLayerUpdate?: (index: number, updates: Partial<OverlayLayer>) => void;
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
  onLayerUpdate,
}: VideoOverlayPreviewProps) {
  const mode = config.mode;
  const containerRef = useRef<HTMLDivElement>(null);

  const playResX = mode === "landscape" ? (videoWidth ?? 1920) : 1080;
  const playResY = mode === "landscape" ? (videoHeight ?? 1080) : 1920;
  const aspectRatio = playResX / playResY;
  const previewWidth = Math.round(previewHeight * aspectRatio);
  const scale = previewHeight / playResY;

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
        ref={containerRef}
        style={{
          position: "relative",
          width: previewWidth,
          height: previewHeight,
          background: "#111",
          overflow: "hidden",
          borderRadius: 8,
          flexShrink: 0,
          userSelect: "none",
        }}
      >
        {/* Video thumbnail background */}
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt=""
            draggable={false}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "rgba(255,255,255,0.15)", fontSize: 11,
          }}>
            video preview
          </div>
        )}

        {/* Overlay layers */}
        {config.layers.map((layer, i) => {
          if (layer.type === "title") return (
            <TitleLayerPreview key={i} layer={layer} layerIndex={i} scale={scale} containerRef={containerRef} onLayerUpdate={onLayerUpdate} />
          );
          if (layer.type === "text") return (
            <TextLayerPreview
              key={i} layer={layer} layerIndex={i} scale={scale}
              containerRef={containerRef} onLayerUpdate={onLayerUpdate}
            />
          );
          if (layer.type === "image") return (
            <ImageLayerPreview
              key={i} layer={layer} layerIndex={i}
              previewWidth={previewWidth} previewHeight={previewHeight}
              containerRef={containerRef} onLayerUpdate={onLayerUpdate}
            />
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
        {onLayerUpdate && " · drag text & images to reposition"}
      </p>
    </div>
  );
}

// ── Drag helper ───────────────────────────────────────────────────────────────

function startDrag(
  e: React.MouseEvent,
  containerRef: React.RefObject<HTMLDivElement>,
  onMove: (dx: number, dy: number) => void,
) {
  if (!containerRef.current) return;
  e.preventDefault();
  e.stopPropagation();
  const rect = containerRef.current.getBoundingClientRect();
  const startX = e.clientX;
  const startY = e.clientY;

  function onMouseMove(ev: MouseEvent) {
    onMove((ev.clientX - startX) / rect.width, (ev.clientY - startY) / rect.height);
  }
  function onMouseUp() {
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  }
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TitleLayerPreview({ layer, layerIndex, scale, containerRef, onLayerUpdate }: {
  layer: TitleLayer;
  layerIndex: number;
  scale: number;
  containerRef: React.RefObject<HTMLDivElement>;
  onLayerUpdate?: (index: number, updates: Partial<OverlayLayer>) => void;
}) {
  if (!layer.text.trim()) return null;

  const fontSize = layer.fontSize * scale;
  const marginV = 25 * scale;
  const font = FONT_STACK[layer.font] ?? "sans-serif";
  const bg = layer.background;
  const stroke = layer.stroke;
  const draggable = !!onLayerUpdate;

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

  function handleMouseDown(e: React.MouseEvent) {
    if (!onLayerUpdate) return;
    const startY = layer.customY ?? (layer.position === "top" ? marginV / containerRef.current!.clientHeight : 1 - marginV / containerRef.current!.clientHeight);
    startDrag(e, containerRef, (_dx, dy) => {
      onLayerUpdate(layerIndex, {
        customY: Math.max(0.02, Math.min(0.98, startY + dy)),
      } as Partial<TitleLayer>);
    });
  }

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{
        position: "absolute", left: "50%", top, bottom, transform,
        fontFamily: font, fontSize, fontWeight: layer.bold ? "900" : "400",
        color: layer.color, whiteSpace: "nowrap",
        padding: bg.enabled ? `${2 * scale}px ${6 * scale}px` : 0,
        background: bg.enabled ? hexAlpha(bg.color, bg.opacity) : "transparent",
        WebkitTextStroke: stroke.width > 0 ? `${stroke.width * scale}px ${stroke.color}` : undefined,
        lineHeight: 1.2, zIndex: 10,
        cursor: draggable ? "grab" : "default",
        outline: draggable ? "1px dashed rgba(255,255,255,0.25)" : "none",
        outlineOffset: 2,
      }}
    >
      {layer.text}
    </div>
  );
}

function TextLayerPreview({ layer, layerIndex, scale, containerRef, onLayerUpdate }: {
  layer: TextLayer; layerIndex: number; scale: number;
  containerRef: React.RefObject<HTMLDivElement>;
  onLayerUpdate?: (index: number, updates: Partial<OverlayLayer>) => void;
}) {
  if (!layer.text.trim()) return null;

  const fontSize = layer.fontSize * scale;
  const font = FONT_STACK[layer.font] ?? "sans-serif";
  const bg = layer.background;
  const draggable = !!onLayerUpdate;

  function handleMouseDown(e: React.MouseEvent) {
    if (!onLayerUpdate) return;
    const startX = layer.x;
    const startY = layer.y;
    startDrag(e, containerRef, (dx, dy) => {
      onLayerUpdate(layerIndex, {
        x: Math.max(0.02, Math.min(0.98, startX + dx)),
        y: Math.max(0.02, Math.min(0.98, startY + dy)),
      } as Partial<TextLayer>);
    });
  }

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{
        position: "absolute",
        left: `${layer.x * 100}%`,
        top: `${layer.y * 100}%`,
        transform: "translate(-50%, -50%)",
        fontFamily: font, fontSize,
        fontWeight: layer.bold ? "700" : "400",
        color: layer.color, whiteSpace: "nowrap",
        padding: bg.enabled ? `${2 * scale}px ${5 * scale}px` : 0,
        background: bg.enabled ? hexAlpha(bg.color, bg.opacity) : "transparent",
        zIndex: 9,
        cursor: draggable ? "grab" : "default",
        outline: draggable ? "1px dashed rgba(255,255,255,0.25)" : "none",
        outlineOffset: 2,
      }}
    >
      {layer.text}
    </div>
  );
}

function ImageLayerPreview({ layer, layerIndex, previewWidth, previewHeight, containerRef, onLayerUpdate }: {
  layer: ImageLayer; layerIndex: number;
  previewWidth: number; previewHeight: number;
  containerRef: React.RefObject<HTMLDivElement>;
  onLayerUpdate?: (index: number, updates: Partial<OverlayLayer>) => void;
}) {
  if (!layer.publicUrl) return null;

  const imgWidth = previewWidth * layer.width;
  const left = previewWidth * layer.x;
  const top = previewHeight * layer.y;
  const draggable = !!onLayerUpdate;

  function handleMouseDown(e: React.MouseEvent) {
    if (!onLayerUpdate) return;
    const startX = layer.x;
    const startY = layer.y;
    startDrag(e, containerRef, (dx, dy) => {
      onLayerUpdate(layerIndex, {
        x: Math.max(0, Math.min(0.95, startX + dx)),
        y: Math.max(0, Math.min(0.95, startY + dy)),
      } as Partial<ImageLayer>);
    });
  }

  function handleResizeMouseDown(e: React.MouseEvent) {
    if (!onLayerUpdate) return;
    if (!containerRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = containerRef.current.getBoundingClientRect();
    const startClientX = e.clientX;
    const startWidth = layer.width;

    function onMouseMove(ev: MouseEvent) {
      const dx = (ev.clientX - startClientX) / rect.width;
      onLayerUpdate!(layerIndex, {
        width: Math.max(0.04, Math.min(0.8, startWidth + dx)),
      } as Partial<ImageLayer>);
    }
    function onMouseUp() {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{
        position: "absolute", left, top,
        width: imgWidth,
        cursor: draggable ? "grab" : "default",
        zIndex: 8,
        outline: draggable ? "1px dashed rgba(255,255,255,0.25)" : "none",
        outlineOffset: 2,
      }}
    >
      <img src={layer.publicUrl} alt="" draggable={false} style={{ width: "100%", height: "auto", display: "block" }} />
      {draggable && (
        <div
          onMouseDown={handleResizeMouseDown}
          style={{
            position: "absolute", right: -5, bottom: -5,
            width: 10, height: 10,
            background: "white", border: "1.5px solid rgba(0,0,0,0.5)",
            borderRadius: 2, cursor: "se-resize", zIndex: 20,
          }}
        />
      )}
    </div>
  );
}

function CaptionSamplePreview({ style, scale, playResX, playResY }: {
  style: import("@/app/ai-clips/types").SubtitleStyle;
  scale: number; playResX: number; playResY: number;
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
      position: "absolute", left: "50%", top, bottom,
      transform: (top === "50%" || style.customCaptionY != null) ? "translate(-50%, -50%)" : "translateX(-50%)",
      display: "flex", gap: `${4 * scale}px`, flexWrap: "wrap",
      justifyContent: "center", zIndex: 11, pointerEvents: "none",
    }}>
      {SAMPLE_WORDS.map((word, i) => (
        <span key={i} style={{
          fontFamily: font, fontSize,
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
