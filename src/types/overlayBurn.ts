// src/types/overlayBurn.ts

export type TitleLayer = {
  type: "title";
  text: string;
  position: "top" | "bottom";
  customY?: number | null;     // 0–1 fraction of video height, overrides position
  font: string;                // "Montserrat" | "Oswald" | "Anton" | "Bebas Neue" | "Poppins" | "Rubik" | "Arial"
  fontSize: number;            // ASS play-res units (e.g. 48)
  color: string;               // hex "#RRGGBB"
  bold: boolean;
  background: { enabled: boolean; color: string; opacity: number }; // opacity 0–100
  stroke: { color: string; width: number };
};

export type TextLayer = {
  type: "text";
  text: string;
  x: number;         // 0–1 fraction of video width (center anchor)
  y: number;         // 0–1 fraction of video height (center anchor)
  font: string;
  fontSize: number;
  color: string;
  bold: boolean;
  background: { enabled: boolean; color: string; opacity: number };
};

export type ImageLayer = {
  type: "image";
  assetId: string | null;   // brand_assets.id if saved, null if per-video
  filePath: string;          // Supabase Storage path in clips bucket
  publicUrl?: string;        // used in preview only, not stored
  x: number;                 // 0–1 from left edge
  y: number;                 // 0–1 from top edge
  width: number;             // 0–1 fraction of video width
};

export type OverlayLayer = TitleLayer | TextLayer | ImageLayer;

export type OverlayConfig = {
  captions: {
    enabled: boolean;
    style: import("@/app/ai-clips/types").SubtitleStyle;
  };
  layers: OverlayLayer[];
  mode: "landscape" | "portrait_blur" | "portrait_crop";
};

export type BurnJobStatus = "pending" | "transcribing" | "burning" | "done" | "failed";

export const DEFAULT_TITLE_LAYER: TitleLayer = {
  type: "title",
  text: "",
  position: "top",
  customY: null,
  font: "Montserrat",
  fontSize: 48,
  color: "#FFFFFF",
  bold: true,
  background: { enabled: true, color: "#000000", opacity: 70 },
  stroke: { color: "#000000", width: 0 },
};

export const DEFAULT_TEXT_LAYER: TextLayer = {
  type: "text",
  text: "Follow for more!",
  x: 0.5,
  y: 0.88,
  font: "Montserrat",
  fontSize: 36,
  color: "#FFFFFF",
  bold: false,
  background: { enabled: false, color: "#000000", opacity: 60 },
};

export const DEFAULT_IMAGE_LAYER: ImageLayer = {
  type: "image",
  assetId: null,
  filePath: "",
  x: 0.05,
  y: 0.05,
  width: 0.15,
};
