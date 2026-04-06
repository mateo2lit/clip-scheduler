// src/components/uploads/EnhanceVideoPanel.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/app/login/supabaseClient";
import {
  OverlayConfig, OverlayLayer, TitleLayer, TextLayer, ImageLayer,
  DEFAULT_TITLE_LAYER, DEFAULT_TEXT_LAYER, DEFAULT_IMAGE_LAYER,
  BurnJobStatus,
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

export function EnhanceVideoPanel({
  uploadId,
  teamId,
  videoWidth,
  videoHeight,
  thumbnailUrl,
  onBurnStart,
}: EnhancePanelProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"captions" | "overlays">("captions");
  const [config, setConfig] = useState<OverlayConfig>(DEFAULT_CONFIG);
  const [brandAssets, setBrandAssets] = useState<BrandAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [burning, setBurning] = useState(false);
  const [burnError, setBurnError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset config when upload changes
  useEffect(() => {
    setConfig(DEFAULT_CONFIG);
    setBurnError(null);
  }, [uploadId]);

  // Load brand assets when panel opens
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

      const newLayer: ImageLayer = { ...DEFAULT_IMAGE_LAYER, filePath: path, publicUrl: publicUrl ?? undefined };
      if (layerIndex !== null) {
        updateLayer(layerIndex, { filePath: path, publicUrl: publicUrl ?? undefined } as Partial<ImageLayer>);
      } else {
        addLayer(newLayer);
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
      setBurning(false);
    }
  }

  const hasContent =
    config.captions.enabled ||
    config.layers.some((l) => l.type !== "image" ? (l as TextLayer | TitleLayer).text.trim() : (l as ImageLayer).filePath);

  return (
    <div className="rounded-2xl border border-white/10 overflow-hidden">
      {/* Header / toggle */}
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

      {/* Expanded content */}
      {open && (
        <div className="border-t border-white/10">
          {/* Mode selector */}
          <div className="flex items-center gap-2 px-4 pt-3 pb-2">
            <span className="text-[10px] text-white/30 uppercase tracking-wider w-12">Mode</span>
            {(["landscape", "portrait_blur", "portrait_crop"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setConfig((c) => ({ ...c, mode: m }))}
                className={`rounded-lg px-3 py-1 text-xs transition-colors ${
                  config.mode === m
                    ? "bg-purple-600 text-white"
                    : "bg-white/5 text-white/50 hover:bg-white/10"
                }`}
              >
                {m === "landscape" ? "16:9" : m === "portrait_blur" ? "9:16 Blur" : "9:16 Crop"}
              </button>
            ))}
          </div>

          <div className="flex gap-4 px-4 pb-4" style={{ minHeight: 0 }}>
            {/* Live preview */}
            <div className="shrink-0">
              <VideoOverlayPreview
                config={config}
                thumbnailUrl={thumbnailUrl}
                videoWidth={videoWidth}
                videoHeight={videoHeight}
                previewHeight={320}
              />
            </div>

            {/* Controls */}
            <div className="flex-1 min-w-0 flex flex-col gap-3">
              {/* Tabs */}
              <div className="flex gap-1 rounded-lg bg-white/5 p-1 w-fit">
                {(["captions", "overlays"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                      tab === t ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* Captions tab */}
              {tab === "captions" && (
                <div className="space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.captions.enabled}
                      onChange={(e) => updateCaptions({ enabled: e.target.checked })}
                      className="rounded"
                    />
                    <span className="text-sm text-white/70">Auto-transcribe & add captions</span>
                  </label>
                  {config.captions.enabled && (
                    <SubtitleStylePicker
                      style={config.captions.style}
                      onChange={(s) => updateCaptions({ style: s })}
                    />
                  )}
                </div>
              )}

              {/* Overlays tab */}
              {tab === "overlays" && (
                <div className="space-y-3">
                  {/* Existing layers */}
                  {config.layers.map((layer, i) => (
                    <LayerEditor
                      key={i}
                      layer={layer}
                      index={i}
                      brandAssets={brandAssets}
                      onUpdate={(p) => updateLayer(i, p)}
                      onRemove={() => removeLayer(i)}
                      onImageUpload={(file, save) => handleImageUpload(file, i, save)}
                    />
                  ))}

                  {/* Add layer buttons */}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => addLayer({ ...DEFAULT_TITLE_LAYER })}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 transition-colors"
                    >
                      + Title
                    </button>
                    <button
                      type="button"
                      onClick={() => addLayer({ ...DEFAULT_TEXT_LAYER })}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 transition-colors"
                    >
                      + Text
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingImage}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 transition-colors disabled:opacity-50"
                    >
                      {uploadingImage ? "Uploading…" : "+ Image"}
                    </button>
                    <input
                      ref={fileInputRef}
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
                      <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">Saved assets</p>
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
                            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white/60 hover:bg-white/10 transition-colors"
                          >
                            {asset.signedUrl && (
                              <img src={asset.signedUrl} alt="" className="w-5 h-5 object-contain rounded" />
                            )}
                            {asset.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Burn button */}
              {hasContent && (
                <div className="mt-auto pt-2">
                  {burnError && (
                    <p className="text-xs text-red-400 mb-2">{burnError}</p>
                  )}
                  <button
                    type="button"
                    onClick={handleBurn}
                    disabled={burning || !uploadId}
                    className="w-full rounded-xl bg-gradient-to-r from-purple-600 to-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg hover:from-purple-500 hover:to-violet-500 disabled:opacity-50 transition-all"
                  >
                    {burning ? "Starting burn…" : "✨ Burn Overlays & Schedule"}
                  </button>
                  <p className="text-[10px] text-white/25 text-center mt-1">
                    Takes 1–3 min. You'll see progress while it processes.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Layer editor sub-component ────────────────────────────────────────────────

function LayerEditor({
  layer, index, brandAssets, onUpdate, onRemove, onImageUpload,
}: {
  layer: OverlayLayer;
  index: number;
  brandAssets: BrandAsset[];
  onUpdate: (p: Partial<OverlayLayer>) => void;
  onRemove: () => void;
  onImageUpload: (file: File, save: boolean) => void;
}) {
  const [saveToAccount, setSaveToAccount] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const labelColors = "text-[10px] text-white/30 uppercase tracking-wider";
  const inputCls = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder-white/30 outline-none focus:border-white/20";

  if (layer.type === "title") {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-white/60">Title overlay</span>
          <button type="button" onClick={onRemove} className="text-white/30 hover:text-red-400 text-xs">Remove</button>
        </div>
        <input
          className={inputCls}
          placeholder="Title text…"
          value={layer.text}
          onChange={(e) => onUpdate({ text: e.target.value } as Partial<TitleLayer>)}
        />
        <div className="flex gap-2">
          <div className="flex-1">
            <p className={labelColors}>Position</p>
            <div className="flex gap-1 mt-1">
              {(["top", "bottom"] as const).map((p) => (
                <button key={p} type="button"
                  onClick={() => onUpdate({ position: p } as Partial<TitleLayer>)}
                  className={`flex-1 rounded-lg py-1 text-xs capitalize transition-colors ${layer.position === p ? "bg-purple-600 text-white" : "bg-white/5 text-white/40 hover:bg-white/10"}`}
                >{p}</button>
              ))}
            </div>
          </div>
          <div className="flex-1">
            <p className={labelColors}>Font</p>
            <select
              value={layer.font}
              onChange={(e) => onUpdate({ font: e.target.value } as Partial<TitleLayer>)}
              className={inputCls + " mt-1"}
            >
              {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <div>
            <p className={labelColors}>Color</p>
            <input type="color" value={layer.color}
              onChange={(e) => onUpdate({ color: e.target.value } as Partial<TitleLayer>)}
              className="mt-1 h-7 w-12 cursor-pointer rounded border border-white/10 bg-transparent" />
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer mt-4">
            <input type="checkbox" checked={layer.bold}
              onChange={(e) => onUpdate({ bold: e.target.checked } as Partial<TitleLayer>)} />
            <span className="text-xs text-white/50">Bold</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer mt-4">
            <input type="checkbox" checked={layer.background.enabled}
              onChange={(e) => onUpdate({ background: { ...layer.background, enabled: e.target.checked } } as Partial<TitleLayer>)} />
            <span className="text-xs text-white/50">Background</span>
          </label>
          {layer.background.enabled && (
            <>
              <div>
                <p className={labelColors}>BG Color</p>
                <input type="color" value={layer.background.color}
                  onChange={(e) => onUpdate({ background: { ...layer.background, color: e.target.value } } as Partial<TitleLayer>)}
                  className="mt-1 h-7 w-12 cursor-pointer rounded border border-white/10 bg-transparent" />
              </div>
              <div className="flex-1">
                <p className={labelColors}>Opacity {layer.background.opacity}%</p>
                <input type="range" min={0} max={100} value={layer.background.opacity}
                  onChange={(e) => onUpdate({ background: { ...layer.background, opacity: Number(e.target.value) } } as Partial<TitleLayer>)}
                  className="mt-1 w-full" />
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (layer.type === "text") {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-white/60">Text overlay</span>
          <button type="button" onClick={onRemove} className="text-white/30 hover:text-red-400 text-xs">Remove</button>
        </div>
        <input
          className={inputCls}
          placeholder="Text…"
          value={layer.text}
          onChange={(e) => onUpdate({ text: e.target.value } as Partial<TextLayer>)}
        />
        <div className="flex gap-2">
          <div className="flex-1">
            <p className={labelColors}>Font</p>
            <select value={layer.font}
              onChange={(e) => onUpdate({ font: e.target.value } as Partial<TextLayer>)}
              className={inputCls + " mt-1"}>
              {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <p className={labelColors}>Color</p>
            <input type="color" value={layer.color}
              onChange={(e) => onUpdate({ color: e.target.value } as Partial<TextLayer>)}
              className="mt-1 h-7 w-12 cursor-pointer rounded border border-white/10 bg-transparent" />
          </div>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <p className={labelColors}>X pos {Math.round(layer.x * 100)}%</p>
            <input type="range" min={0} max={100} value={Math.round(layer.x * 100)}
              onChange={(e) => onUpdate({ x: Number(e.target.value) / 100 } as Partial<TextLayer>)}
              className="w-full" />
          </div>
          <div className="flex-1">
            <p className={labelColors}>Y pos {Math.round(layer.y * 100)}%</p>
            <input type="range" min={0} max={100} value={Math.round(layer.y * 100)}
              onChange={(e) => onUpdate({ y: Number(e.target.value) / 100 } as Partial<TextLayer>)}
              className="w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (layer.type === "image") {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-white/60">Image overlay</span>
          <button type="button" onClick={onRemove} className="text-white/30 hover:text-red-400 text-xs">Remove</button>
        </div>
        <div className="flex items-center gap-2">
          {layer.publicUrl && (
            <img src={layer.publicUrl} alt="" className="h-10 w-10 object-contain rounded border border-white/10" />
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 transition-colors"
          >
            {layer.filePath ? "Replace image" : "Choose image"}
          </button>
          <label className="flex items-center gap-1.5 cursor-pointer text-xs text-white/40">
            <input type="checkbox" checked={saveToAccount} onChange={(e) => setSaveToAccount(e.target.checked)} />
            Save to account
          </label>
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
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <p className={labelColors}>X {Math.round(layer.x * 100)}%</p>
            <input type="range" min={0} max={90} value={Math.round(layer.x * 100)}
              onChange={(e) => onUpdate({ x: Number(e.target.value) / 100 } as Partial<ImageLayer>)}
              className="w-full" />
          </div>
          <div className="flex-1">
            <p className={labelColors}>Y {Math.round(layer.y * 100)}%</p>
            <input type="range" min={0} max={90} value={Math.round(layer.y * 100)}
              onChange={(e) => onUpdate({ y: Number(e.target.value) / 100 } as Partial<ImageLayer>)}
              className="w-full" />
          </div>
          <div className="flex-1">
            <p className={labelColors}>Size {Math.round(layer.width * 100)}%</p>
            <input type="range" min={5} max={50} value={Math.round(layer.width * 100)}
              onChange={(e) => onUpdate({ width: Number(e.target.value) / 100 } as Partial<ImageLayer>)}
              className="w-full" />
          </div>
        </div>
      </div>
    );
  }

  return null;
}
