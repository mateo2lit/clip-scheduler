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
  // Title overlay (optional — workflow and UI default if absent)
  titleEnabled?: boolean;
  titlePosition?: "top" | "bottom";
  titleText?: string;
  titleBg?: boolean;
  titleBgColor?: string;
  titleBgOpacity?: number;
  titleFontFamily?: "Montserrat" | "Oswald" | "Arial";
  titleFontSize?: number;
  titleColor?: string;
  titleBold?: boolean;
  // Custom drag positions (0–1, fraction of video height from top; overrides position/titlePosition)
  customCaptionY?: number;
  titleCustomY?: number;
  // Title stroke/outline
  titleStrokeColor?: string;
  titleStrokeWidth?: number;
};

export type PresetKey = "none" | "karaoke" | "beasty" | "deep_diver" | "youshaei" | "pod_p";

export const PRESETS: Record<PresetKey, SubtitleStyle> = {
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

export const PRESET_LABELS: Record<PresetKey, string> = {
  none: "No captions",
  karaoke: "Karaoke",
  beasty: "Beasty",
  deep_diver: "Deep Diver",
  youshaei: "Youshaei",
  pod_p: "Pod P",
};

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  ...PRESETS.karaoke,
  fontSize: 70,
  titleEnabled: true,
  titlePosition: "top",
  titleText: "",
  titleBg: true,
  titleBgColor: "#FFFFFF",
  titleBgOpacity: 100,
  titleFontFamily: "Montserrat",
  titleFontSize: 48,
  titleColor: "#000000",
  titleBold: true,
  titleStrokeColor: "#000000",
  titleStrokeWidth: 0,
};
