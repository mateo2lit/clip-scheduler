// src/components/uploads/EnhanceVideoPanel.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/app/login/supabaseClient";
import {
  OverlayConfig, OverlayLayer, TitleLayer, TextLayer, ImageLayer,
  DEFAULT_TITLE_LAYER, DEFAULT_TEXT_LAYER, DEFAULT_IMAGE_LAYER,
} from "@/types/overlayBurn";
import { DEFAULT_SUBTITLE_STYLE } from "@/app/ai-clips/types";
import { SubtitleStylePicker } from "@/components/ai-clips/SubtitleStylePicker";
import { VideoOverlayPreview } from "@/components/uploads/VideoOverlayPreview";

const FONTS = ["Montserrat", "Oswald", "Anton", "Bebas Neue", "Poppins", "Rubik", "Arial"];

interface BrandAsset {
  id: string;
  name: string;
  file_path: string;
  signedUrl: string | null;
}

interface EnhancePanelProps {
  uploadId: string | null;
  teamId: string;
  videoWidth: number | null;
  videoHeight: number | null;
  thumbnailUrl?: string | null;
  onBurnStart: (jobId: string) => void;
}

const DEFAULT_CONFIG: OverlayConfig = {
  captions: { enabled: false, style: { ...DEFAULT_SUBTITLE_STYLE } },
  layers: [],
  mode: "landscape",
};

// ── Toggle switch ─────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
        checked ? "bg-purple-600" : "bg-white/15"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function EnhanceVideoPanel({
  uploadId,
  teamId,
  videoWidth,
  videoHeight,
  thumbnailUrl,
  onBurnStart,
}: EnhancePanelProps) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<OverlayConfig>(DEFAULT_CONFIG);
  const [brandAssets, setBrandAssets] = useState<BrandAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [burning, setBurning] = useState(false);
  const [burnError, setBurnError] = useState<string | null>(null);
  const addImageRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setConfig(DEFAULT_CONFIG);
    setBurnError(null);
  }, [uploadId]);

  useEffect(() => {
    if (!open) return;
    loadBrandAssets();
  }, [open]);

  async function loadBrandAssets() {
    setLoadingAssets(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/brand-assets", { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (json.ok) setBrandAssets(json.assets);
    } catch {}
    finally { setLoadingAssets(false); }
  }

  function updateCaptions(partial: Partial<OverlayConfig["captions"]>) {
    setConfig((c) => ({ ...c, captions: { ...c.captions, ...partial } }));
  }

  function addLayer(layer: OverlayLayer) {
    setConfig((c) => ({ ...c, layers: [...c.layers, layer] }));
  }

  function removeLayer(index: number) {
    setConfig((c) => ({ ...c, layers: c.layers.filter((_, i) => i !== index) }));
  }

  function updateLayer(index: number, partial: Partial<OverlayLayer>) {
    setConfig((c) => ({
      ...c,
      layers: c.layers.map((l, i) => i === index ? { ...l, ...partial } as OverlayLayer : l),
    }));
  }

  async function handleImageUpload(file: File, layerIndex: number | null, saveToAccount: boolean) {
    setUploadingImage(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${teamId}/brand/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("clips").upload(path, file, { contentType: file.type });
      if (error) throw error;

      const { data: signed } = await supabase.storage.from("clips").createSignedUrl(path, 3600);
      const publicUrl = signed?.signedUrl ?? null;

      if (saveToAccount) {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (token) {
          await fetch("/api/brand-assets", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ name: file.name, filePath: path, fileSize: file.size }),
          });
          await loadBrandAssets();
        }
      }

      if (layerIndex !== null) {
        updateLayer(layerIndex, { filePath: path, publicUrl: publicUrl ?? undefined } as Partial<ImageLayer>);
      } else {
        addLayer({ ...DEFAULT_IMAGE_LAYER, filePath: path, publicUrl: publicUrl ?? undefined });
      }
    } catch (e: any) {
      alert("Image upload failed: " + (e?.message || "Unknown error"));
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleBurn() {
    if (!uploadId) return;
    setBurning(true);
    setBurnError(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Not logged in");

      const res = await fetch("/api/overlay-burn", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUploadId: uploadId, overlayConfig: config }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed to start burn");

      onBurnStart(json.jobId);
    } catch (e: any) {
      setBurnError(e?.message || "Unknown error");
    } finally {
      setBurning(false);
    }
  }

  const hasContent =
    config.captions.enabled ||
    config.layers.some((l) =>
      l.type !== "image" ? !!(l as TextLayer | TitleLayer).text.trim() : !!(l as ImageLayer).filePath
    );

  const previewHeight = config.mode === "landscape" ? 220 : 300;

  return (
    <div className="rounded-2xl border border-white/10 overflow-hidden">
      {/* Collapsed header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          <span className="text-sm font-medium text-white/80">Enhance Video</span>
          {hasContent && (
            <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] text-purple-300">Active</span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-white/40 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-white/10 flex flex-col">

          {/* ── STICKY TOP: mode + preview ── */}
          <div className="px-4 pt-3 pb-3 flex flex-col gap-3 border-b border-white/[0.06]">
            {/* Mode */}
            <div className="flex gap-1.5">
              {(["landscape", "portrait_blur", "portrait_crop"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setConfig((c) => ({ ...c, mode: m }))}
                  className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                    config.mode === m
                      ? "bg-purple-600 text-white"
                      : "bg-white/5 text-white/50 hover:bg-white/10"
                  }`}
                >
                  {m === "landscape" ? "16:9" : m === "portrait_blur" ? "9:16 Blur" : "9:16 Crop"}
                </button>
              ))}
            </div>

            {/* Preview — always visible */}
            <div className="flex justify-center">
              <VideoOverlayPreview
                config={config}
                thumbnailUrl={thumbnailUrl}
                videoWidth={videoWidth}
                videoHeight={videoHeight}
                previewHeight={previewHeight}
                onLayerUpdate={(idx, updates) => updateLayer(idx, updates)}
              />
            </div>
          </div>

          {/* ── SCROLLABLE CONTROLS ── */}
          <div className="overflow-y-auto" style={{ maxHeight: 420 }}>
            <div className="px-4 pt-3 pb-3 flex flex-col gap-3">

              {/* Captions */}
              <CaptionsSection
                enabled={config.captions.enabled}
                style={config.captions.style}
                onToggle={(v) => updateCaptions({ enabled: v })}
                onStyleChange={(s) => updateCaptions({ style: s })}
              />

              {/* Layer cards */}
              {config.layers.map((layer, i) => (
                <LayerCard
                  key={i}
                  layer={layer}
                  brandAssets={brandAssets}
                  onUpdate={(p) => updateLayer(i, p)}
                  onRemove={() => removeLayer(i)}
                  onImageUpload={(file, save) => handleImageUpload(file, i, save)}
                />
              ))}

              {/* Add layer toolbar */}
              <div className="flex flex-wrap gap-2 pt-1">
                <AddButton
                  icon={
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h12M4 14h8" />
                    </svg>
                  }
                  label="Title"
                  onClick={() => addLayer({ ...DEFAULT_TITLE_LAYER })}
                />
                <AddButton
                  icon={
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                  }
                  label="Text"
                  onClick={() => addLayer({ ...DEFAULT_TEXT_LAYER })}
                />
                <AddButton
                  icon={
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  }
                  label={uploadingImage ? "Uploading…" : "Image"}
                  onClick={() => addImageRef.current?.click()}
                  disabled={uploadingImage}
                />
                <input
                  ref={addImageRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageUpload(file, null, false);
                    e.target.value = "";
                  }}
                />
              </div>

              {/* Saved brand assets quick-add */}
              {brandAssets.length > 0 && (
                <div>
                  <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">Saved images</p>
                  <div className="flex flex-wrap gap-2">
                    {brandAssets.map((asset) => (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => addLayer({
                          ...DEFAULT_IMAGE_LAYER,
                          assetId: asset.id,
                          filePath: asset.file_path,
                          publicUrl: asset.signedUrl ?? undefined,
                        })}
                        title={asset.name}
                        className="rounded-lg border border-white/10 bg-white/5 p-1 hover:bg-white/10 transition-colors"
                      >
                        {asset.signedUrl
                          ? <img src={asset.signedUrl} alt={asset.name} className="w-8 h-8 object-contain rounded" />
                          : <span className="text-xs text-white/50 px-1">{asset.name}</span>
                        }
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {loadingAssets && <p className="text-xs text-white/25">Loading saved images…</p>}

            </div>
          </div>

          {/* ── PINNED BOTTOM: burn CTA ── */}
          <div className="px-4 pb-4 pt-3 border-t border-white/[0.06]">
            {burnError && <p className="text-xs text-red-400 mb-2">{burnError}</p>}
            <button
              type="button"
              onClick={handleBurn}
              disabled={burning || !uploadId || !hasContent}
              className="w-full rounded-xl bg-gradient-to-r from-purple-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:from-purple-500 hover:to-violet-500 disabled:opacity-40 transition-all"
            >
              {burning ? "Starting…" : "✨ Burn & Schedule"}
            </button>
            <p className="text-[10px] text-white/25 text-center mt-1.5">
              {!hasContent
                ? "Enable captions or add a layer above to get started"
                : "Takes 1–3 min. You'll see progress as it processes."
              }
            </p>
          </div>

        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function AddButton({ icon, label, onClick, disabled }: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 hover:text-white/80 transition-colors disabled:opacity-40"
    >
      {icon}+ {label}
    </button>
  );
}

const inputCls = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder-white/30 outline-none focus:border-white/20";
const labelCls = "text-[10px] text-white/35 uppercase tracking-wider";

// ── Captions ──────────────────────────────────────────────────────────────────

function CaptionsSection({ enabled, style, onToggle, onStyleChange }: {
  enabled: boolean;
  style: import("@/app/ai-clips/types").SubtitleStyle;
  onToggle: (v: boolean) => void;
  onStyleChange: (s: import("@/app/ai-clips/types").SubtitleStyle) => void;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-white/70">Captions</span>
          <span className="text-[10px] text-white/30">auto-transcribed</span>
        </div>
        <Toggle checked={enabled} onChange={onToggle} />
      </div>
      {enabled && (
        <div className="border-t border-white/10 px-3 pb-3 pt-2">
          <SubtitleStylePicker style={style} onChange={onStyleChange} />
        </div>
      )}
    </div>
  );
}

// ── Layer card ────────────────────────────────────────────────────────────────

function LayerCard({ layer, brandAssets, onUpdate, onRemove, onImageUpload }: {
  layer: OverlayLayer;
  brandAssets: BrandAsset[];
  onUpdate: (p: Partial<OverlayLayer>) => void;
  onRemove: () => void;
  onImageUpload: (file: File, save: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [showMore, setShowMore] = useState(false);

  const typeLabel = layer.type === "title" ? "Title" : layer.type === "text" ? "Text" : "Image";
  const previewText =
    layer.type === "image"
      ? layer.filePath ? "image added" : "no image yet"
      : (layer as TitleLayer | TextLayer).text.trim() || "empty";

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 flex items-center gap-2 text-left min-w-0"
        >
          <svg
            className={`w-3 h-3 text-white/30 flex-shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-xs font-semibold text-white/70 flex-shrink-0">{typeLabel}</span>
          <span className="text-xs text-white/30 truncate">{previewText}</span>
          {layer.type === "image" && layer.publicUrl && (
            <img src={layer.publicUrl} alt="" className="w-5 h-5 object-contain rounded flex-shrink-0" />
          )}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="flex-shrink-0 text-white/25 hover:text-red-400 transition-colors"
          aria-label="Remove"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {expanded && (
        <div className="border-t border-white/[0.06] px-3 pb-3 pt-3 space-y-3">
          {layer.type === "title" && (
            <TitleEditor layer={layer} onUpdate={onUpdate} showMore={showMore} onToggleMore={() => setShowMore(v => !v)} />
          )}
          {layer.type === "text" && (
            <TextEditor layer={layer} onUpdate={onUpdate} showMore={showMore} onToggleMore={() => setShowMore(v => !v)} />
          )}
          {layer.type === "image" && (
            <ImageEditor layer={layer} brandAssets={brandAssets} onUpdate={onUpdate} onImageUpload={onImageUpload} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Title editor ──────────────────────────────────────────────────────────────

function TitleEditor({ layer, onUpdate, showMore, onToggleMore }: {
  layer: TitleLayer;
  onUpdate: (p: Partial<OverlayLayer>) => void;
  showMore: boolean;
  onToggleMore: () => void;
}) {
  return (
    <div className="space-y-3">
      {/* Text */}
      <input
        className={inputCls}
        placeholder="Title text…"
        value={layer.text}
        onChange={(e) => onUpdate({ text: e.target.value } as Partial<TitleLayer>)}
      />

      {/* Size + Position row */}
      <div className="flex gap-3 items-end">
        {/* Font size */}
        <div className="flex-1">
          <p className={labelCls}>Size — {layer.fontSize}pt</p>
          <input
            type="range" min={24} max={120} step={2}
            value={layer.fontSize}
            onChange={(e) => onUpdate({ fontSize: Number(e.target.value) } as Partial<TitleLayer>)}
            className="mt-1.5 w-full accent-purple-500"
          />
        </div>
        {/* Position */}
        <div className="flex-shrink-0">
          <p className={labelCls}>Position</p>
          <div className="flex gap-1 mt-1.5">
            {(["top", "bottom"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onUpdate({ position: p, customY: null } as Partial<TitleLayer>)}
                className={`rounded-lg px-3 py-1 text-xs capitalize transition-colors ${
                  layer.position === p && layer.customY == null
                    ? "bg-purple-600 text-white"
                    : "bg-white/5 text-white/40 hover:bg-white/10"
                }`}
              >{p}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Y fine-tune (shown when customY is set, or always via More) */}
      {layer.customY != null && (
        <div>
          <p className={labelCls}>Vertical position — {Math.round(layer.customY * 100)}%</p>
          <input
            type="range" min={0} max={100} step={1}
            value={Math.round((layer.customY ?? 0) * 100)}
            onChange={(e) => onUpdate({ customY: Number(e.target.value) / 100 } as Partial<TitleLayer>)}
            className="mt-1.5 w-full accent-purple-500"
          />
        </div>
      )}

      <p className="text-[10px] text-white/25 italic">Drag the title in the preview to set a custom position</p>

      {/* More options toggle */}
      <button
        type="button"
        onClick={onToggleMore}
        className="text-[11px] text-white/30 hover:text-white/50 transition-colors flex items-center gap-1"
      >
        <svg className={`w-3 h-3 transition-transform ${showMore ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        {showMore ? "Fewer options" : "More options"}
      </button>

      {showMore && (
        <div className="space-y-3 pt-1">
          {/* Font */}
          <div>
            <p className={labelCls}>Font</p>
            <select
              value={layer.font}
              onChange={(e) => onUpdate({ font: e.target.value } as Partial<TitleLayer>)}
              className={"mt-1 " + inputCls}
            >
              {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          {/* Color + Bold */}
          <div className="flex gap-4 items-center">
            <div className="flex items-center gap-2">
              <p className={labelCls}>Color</p>
              <input
                type="color" value={layer.color}
                onChange={(e) => onUpdate({ color: e.target.value } as Partial<TitleLayer>)}
                className="h-7 w-10 cursor-pointer rounded border border-white/10 bg-transparent"
              />
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={layer.bold}
                onChange={(e) => onUpdate({ bold: e.target.checked } as Partial<TitleLayer>)} />
              <span className="text-xs text-white/50">Bold</span>
            </label>
          </div>

          {/* Stroke */}
          <div className="flex gap-3 items-end">
            <div>
              <p className={labelCls}>Stroke color</p>
              <input
                type="color" value={layer.stroke.color}
                onChange={(e) => onUpdate({ stroke: { ...layer.stroke, color: e.target.value } } as Partial<TitleLayer>)}
                className="mt-1 h-7 w-10 cursor-pointer rounded border border-white/10 bg-transparent"
              />
            </div>
            <div className="flex-1">
              <p className={labelCls}>Stroke width — {layer.stroke.width}px</p>
              <input
                type="range" min={0} max={8} step={0.5}
                value={layer.stroke.width}
                onChange={(e) => onUpdate({ stroke: { ...layer.stroke, width: Number(e.target.value) } } as Partial<TitleLayer>)}
                className="mt-1.5 w-full accent-purple-500"
              />
            </div>
          </div>

          {/* Background */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={layer.background.enabled}
              onChange={(e) => onUpdate({ background: { ...layer.background, enabled: e.target.checked } } as Partial<TitleLayer>)}
            />
            <span className="text-xs text-white/50">Background box</span>
          </label>
          {layer.background.enabled && (
            <div className="flex gap-3 items-end">
              <div>
                <p className={labelCls}>BG color</p>
                <input
                  type="color" value={layer.background.color}
                  onChange={(e) => onUpdate({ background: { ...layer.background, color: e.target.value } } as Partial<TitleLayer>)}
                  className="mt-1 h-7 w-10 cursor-pointer rounded border border-white/10 bg-transparent"
                />
              </div>
              <div className="flex-1">
                <p className={labelCls}>Opacity — {layer.background.opacity}%</p>
                <input
                  type="range" min={0} max={100}
                  value={layer.background.opacity}
                  onChange={(e) => onUpdate({ background: { ...layer.background, opacity: Number(e.target.value) } } as Partial<TitleLayer>)}
                  className="mt-1.5 w-full accent-purple-500"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Text editor ───────────────────────────────────────────────────────────────

function TextEditor({ layer, onUpdate, showMore, onToggleMore }: {
  layer: TextLayer;
  onUpdate: (p: Partial<OverlayLayer>) => void;
  showMore: boolean;
  onToggleMore: () => void;
}) {
  return (
    <div className="space-y-3">
      <input
        className={inputCls}
        placeholder="Text…"
        value={layer.text}
        onChange={(e) => onUpdate({ text: e.target.value } as Partial<TextLayer>)}
      />

      {/* Size */}
      <div>
        <p className={labelCls}>Size — {layer.fontSize}pt</p>
        <input
          type="range" min={16} max={100} step={2}
          value={layer.fontSize}
          onChange={(e) => onUpdate({ fontSize: Number(e.target.value) } as Partial<TextLayer>)}
          className="mt-1.5 w-full accent-purple-500"
        />
      </div>

      <p className="text-[10px] text-white/25 italic">Drag in the preview to reposition</p>

      <button
        type="button"
        onClick={onToggleMore}
        className="text-[11px] text-white/30 hover:text-white/50 transition-colors flex items-center gap-1"
      >
        <svg className={`w-3 h-3 transition-transform ${showMore ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        {showMore ? "Fewer options" : "More options"}
      </button>

      {showMore && (
        <div className="space-y-3 pt-1">
          <div>
            <p className={labelCls}>Font</p>
            <select
              value={layer.font}
              onChange={(e) => onUpdate({ font: e.target.value } as Partial<TextLayer>)}
              className={"mt-1 " + inputCls}
            >
              {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="flex gap-4 items-center">
            <div className="flex items-center gap-2">
              <p className={labelCls}>Color</p>
              <input
                type="color" value={layer.color}
                onChange={(e) => onUpdate({ color: e.target.value } as Partial<TextLayer>)}
                className="h-7 w-10 cursor-pointer rounded border border-white/10 bg-transparent"
              />
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={layer.bold}
                onChange={(e) => onUpdate({ bold: e.target.checked } as Partial<TextLayer>)} />
              <span className="text-xs text-white/50">Bold</span>
            </label>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={layer.background.enabled}
              onChange={(e) => onUpdate({ background: { ...layer.background, enabled: e.target.checked } } as Partial<TextLayer>)}
            />
            <span className="text-xs text-white/50">Background box</span>
          </label>
          {layer.background.enabled && (
            <div className="flex gap-3 items-end">
              <div>
                <p className={labelCls}>BG color</p>
                <input
                  type="color" value={layer.background.color}
                  onChange={(e) => onUpdate({ background: { ...layer.background, color: e.target.value } } as Partial<TextLayer>)}
                  className="mt-1 h-7 w-10 cursor-pointer rounded border border-white/10 bg-transparent"
                />
              </div>
              <div className="flex-1">
                <p className={labelCls}>Opacity — {layer.background.opacity}%</p>
                <input
                  type="range" min={0} max={100}
                  value={layer.background.opacity}
                  onChange={(e) => onUpdate({ background: { ...layer.background, opacity: Number(e.target.value) } } as Partial<TextLayer>)}
                  className="mt-1.5 w-full accent-purple-500"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Image editor ──────────────────────────────────────────────────────────────

function ImageEditor({ layer, brandAssets, onUpdate, onImageUpload }: {
  layer: ImageLayer;
  brandAssets: BrandAsset[];
  onUpdate: (p: Partial<OverlayLayer>) => void;
  onImageUpload: (file: File, save: boolean) => void;
}) {
  const [saveToAccount, setSaveToAccount] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {layer.publicUrl && (
          <img src={layer.publicUrl} alt="" className="h-12 w-12 object-contain rounded border border-white/10 flex-shrink-0" />
        )}
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 transition-colors w-fit"
          >
            {layer.filePath ? "Replace image" : "Choose image"}
          </button>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={saveToAccount} onChange={(e) => setSaveToAccount(e.target.checked)} />
            <span className="text-[11px] text-white/40">Save to my images</span>
          </label>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onImageUpload(file, saveToAccount);
          e.target.value = "";
        }}
      />

      <p className="text-[10px] text-white/25 italic">Drag to reposition · drag corner handle to resize</p>

      {brandAssets.length > 0 && (
        <div>
          <p className={labelCls + " mb-1.5"}>Use saved image</p>
          <div className="flex flex-wrap gap-1.5">
            {brandAssets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => onUpdate({
                  assetId: asset.id,
                  filePath: asset.file_path,
                  publicUrl: asset.signedUrl ?? undefined,
                } as Partial<ImageLayer>)}
                title={asset.name}
                className="rounded-lg border border-white/10 bg-white/5 p-1 hover:bg-white/10 transition-colors"
              >
                {asset.signedUrl
                  ? <img src={asset.signedUrl} alt={asset.name} className="w-7 h-7 object-contain rounded" />
                  : <span className="text-[10px] text-white/40 px-1">{asset.name}</span>
                }
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
