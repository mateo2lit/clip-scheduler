"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/login/supabaseClient";
import { CaretLeft, Camera, Plus, X as XIcon } from "@phosphor-icons/react/dist/ssr";

type BioLink = {
  title: string;
  url: string;
  icon: string;
};

export default function LinkInBioSettingsPage() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Form state
  const [slug, setSlug] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [accentColor, setAccentColor] = useState("#8b5cf6");
  const [showRecentPosts, setShowRecentPosts] = useState(true);
  const [links, setLinks] = useState<BioLink[]>([]);
  const [existingSlug, setExistingSlug] = useState<string | null>(null);

  useEffect(() => {
    async function boot() {
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session) {
        window.location.href = "/login";
        return;
      }
      setAuthToken(auth.session.access_token);

      // Load existing bio page
      const res = await fetch("/api/bio", {
        headers: { Authorization: `Bearer ${auth.session.access_token}` },
      });
      const json = await res.json();

      if (json.ok && json.page) {
        setSlug(json.page.slug);
        setDisplayName(json.page.display_name);
        setBio(json.page.bio || "");
        setAvatarUrl(json.page.avatar_url || null);
        setTheme(json.page.theme);
        setAccentColor(json.page.accent_color);
        setShowRecentPosts(json.page.show_recent_posts);
        setExistingSlug(json.page.slug);
        setLinks(
          (json.links || []).map((l: any) => ({
            title: l.title,
            url: l.url,
            icon: l.icon || "",
          }))
        );
      }

      setLoading(false);
    }
    boot();
  }, []);

  async function handleSave() {
    if (!authToken || !slug) return;
    setSaving(true);
    setSaved(false);

    try {
      const res = await fetch("/api/bio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          slug,
          display_name: displayName,
          bio,
          avatar_url: avatarUrl,
          theme,
          accent_color: accentColor,
          show_recent_posts: showRecentPosts,
          links: links.filter((l) => l.title && l.url),
        }),
      });

      const json = await res.json();
      if (!json.ok) {
        alert(json.error || "Failed to save");
      } else {
        setExistingSlug(slug);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      alert("Failed to save bio page");
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !authToken) return;
    setUploadingAvatar(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/bio/avatar", {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
        body: form,
      });
      const json = await res.json();
      if (json.ok) {
        setAvatarUrl(json.url);
      } else {
        alert(json.error || "Failed to upload photo");
      }
    } catch {
      alert("Failed to upload photo");
    } finally {
      setUploadingAvatar(false);
      e.target.value = "";
    }
  }

  function addLink() {
    setLinks([...links, { title: "", url: "", icon: "" }]);
  }

  function removeLink(idx: number) {
    setLinks(links.filter((_, i) => i !== idx));
  }

  function updateLink(idx: number, field: keyof BioLink, value: string) {
    setLinks(links.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }

  const siteUrl = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <main className="min-h-screen bg-[#050505] text-white relative overflow-hidden">
      <nav className="relative z-10 border-b border-white/5">
        <div className="mx-auto max-w-4xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <img src="/logo.svg" alt="Clip Dash" className="h-10 w-auto" />
          </Link>
          <Link href="/dashboard" className="text-sm text-white/40 hover:text-white/70 transition-colors">
            Dashboard
          </Link>
        </div>
      </nav>

      <div className="relative z-10 mx-auto max-w-4xl px-6 pt-10 pb-16">
        <div className="flex items-center gap-3 mb-8">
          <Link href="/dashboard" className="text-white/30 hover:text-white/60 transition-colors">
            <CaretLeft className="w-5 h-5" weight="bold" />
          </Link>
          <h1 className="text-2xl font-bold">Link in Bio</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Settings */}
          <div className="space-y-6">
            {/* URL */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <label className="block text-xs text-white/50 mb-2">Your Bio URL</label>
              <div className="flex items-center gap-0 rounded-xl border border-white/10 bg-white/5 overflow-hidden">
                <span className="px-3 text-sm text-white/30 shrink-0">{siteUrl}/bio/</span>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                  placeholder="username"
                  className="flex-1 bg-transparent px-1 py-2.5 text-sm text-white outline-none"
                />
              </div>
            </div>

            {/* Profile */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
              {/* Avatar */}
              <div className="flex items-center gap-4">
                <label className="relative cursor-pointer group shrink-0">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="sr-only"
                    onChange={handleAvatarUpload}
                    disabled={uploadingAvatar}
                  />
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold relative overflow-hidden"
                    style={{ background: accentColor + "30", color: accentColor }}
                  >
                    {uploadingAvatar ? (
                      <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin opacity-60" />
                    ) : avatarUrl ? (
                      <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      displayName?.[0]?.toUpperCase() || "?"
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full">
                      <Camera className="w-5 h-5 text-white" weight="bold" />
                    </div>
                  </div>
                </label>
                <div>
                  <p className="text-sm font-medium text-white/80">Profile Photo</p>
                  <p className="text-xs text-white/35 mt-0.5">JPG, PNG, WebP · max 5 MB</p>
                  {avatarUrl && (
                    <button
                      onClick={() => setAvatarUrl(null)}
                      className="text-xs text-red-400/60 hover:text-red-400 mt-1 transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
              <div className="border-t border-white/[0.06]" />
              <div>
                <label className="block text-xs text-white/50 mb-1.5">Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name or brand"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-blue-300/40"
                />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1.5">Bio</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="A short description..."
                  rows={2}
                  className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-blue-300/40"
                />
              </div>
            </div>

            {/* Theme */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <label className="block text-xs text-white/50 mb-3">Theme</label>
              <div className="flex gap-3">
                <button
                  onClick={() => setTheme("dark")}
                  className={`flex-1 rounded-xl py-3 text-sm font-medium transition-all border ${
                    theme === "dark"
                      ? "bg-white/10 text-white border-white/20"
                      : "bg-white/[0.02] text-white/40 border-white/[0.06] hover:border-white/10"
                  }`}
                >
                  Dark
                </button>
                <button
                  onClick={() => setTheme("light")}
                  className={`flex-1 rounded-xl py-3 text-sm font-medium transition-all border ${
                    theme === "light"
                      ? "bg-white/10 text-white border-white/20"
                      : "bg-white/[0.02] text-white/40 border-white/[0.06] hover:border-white/10"
                  }`}
                >
                  Light
                </button>
              </div>
              <div className="mt-4">
                <label className="block text-xs text-white/50 mb-1.5">Accent Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="w-10 h-10 rounded-lg border border-white/10 cursor-pointer bg-transparent"
                  />
                  <div className="flex gap-2">
                    {["#8b5cf6", "#3b82f6", "#ec4899", "#10b981", "#f59e0b", "#ef4444"].map((c) => (
                      <button
                        key={c}
                        onClick={() => setAccentColor(c)}
                        className={`w-7 h-7 rounded-full transition-transform ${
                          accentColor === c ? "scale-110 ring-2 ring-white/30" : "hover:scale-105"
                        }`}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Options */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showRecentPosts}
                  onChange={(e) => setShowRecentPosts(e.target.checked)}
                  className="w-4 h-4 rounded accent-purple-500"
                />
                <span className="text-sm text-white/70">Show recent posted content</span>
              </label>
            </div>

            {/* Links */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="flex items-center justify-between mb-4">
                <label className="text-xs text-white/50">Custom Links</label>
                <button
                  onClick={addLink}
                  className="flex items-center gap-1 text-xs text-blue-300 hover:text-blue-200 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" weight="bold" />
                  Add Link
                </button>
              </div>
              <div className="space-y-3">
                {links.map((link, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <div className="flex-1 space-y-1.5">
                      <input
                        type="text"
                        value={link.title}
                        onChange={(e) => updateLink(idx, "title", e.target.value)}
                        placeholder="Link title"
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder-white/30 outline-none focus:border-blue-300/40"
                      />
                      <input
                        type="url"
                        value={link.url}
                        onChange={(e) => updateLink(idx, "url", e.target.value)}
                        placeholder="https://..."
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder-white/30 outline-none focus:border-blue-300/40"
                      />
                    </div>
                    <button
                      onClick={() => removeLink(idx)}
                      className="mt-1.5 p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <XIcon className="w-4 h-4" weight="bold" />
                    </button>
                  </div>
                ))}
                {links.length === 0 && (
                  <p className="text-xs text-white/25">No links yet. Click "Add Link" to add your first link.</p>
                )}
              </div>
            </div>

            {/* Save */}
            <button
              onClick={handleSave}
              disabled={saving || !slug}
              className="w-full rounded-2xl bg-gradient-to-r from-purple-500 to-pink-500 py-3 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving..." : saved ? "Saved!" : existingSlug ? "Update Bio Page" : "Create Bio Page"}
            </button>
          </div>

          {/* Preview */}
          <div className="lg:sticky lg:top-8 lg:self-start">
            <div className="rounded-2xl border border-white/10 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-white/10 bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                  </div>
                  <span className="flex-1 text-center text-[10px] text-white/25">
                    {siteUrl}/bio/{slug || "username"}
                  </span>
                </div>
              </div>
              <div
                className={`p-8 min-h-[400px] ${theme === "dark" ? "bg-[#050505]" : "bg-gray-50"}`}
              >
                <div className="text-center mb-6">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={displayName}
                      className="w-14 h-14 rounded-full mx-auto mb-3 object-cover"
                    />
                  ) : (
                    <div
                      className="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center text-lg font-bold"
                      style={{ background: accentColor + "30", color: accentColor }}
                    >
                      {displayName?.[0]?.toUpperCase() || "?"}
                    </div>
                  )}
                  <p
                    className={`font-bold text-sm ${theme === "dark" ? "text-white" : "text-gray-900"}`}
                  >
                    {displayName || "Your Name"}
                  </p>
                  {bio && (
                    <p
                      className={`text-xs mt-1 ${theme === "dark" ? "text-white/40" : "text-gray-500"}`}
                    >
                      {bio}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  {links.filter((l) => l.title).map((link, i) => (
                    <div
                      key={i}
                      className={`rounded-xl border px-4 py-2.5 text-center text-xs font-medium ${
                        theme === "dark"
                          ? "border-white/10 bg-white/[0.04] text-white/80"
                          : "border-gray-200 bg-white text-gray-700"
                      }`}
                      style={{ borderColor: accentColor + "30" }}
                    >
                      {link.title}
                    </div>
                  ))}
                </div>

                {showRecentPosts && (
                  <div className="mt-6">
                    <p className={`text-[10px] uppercase tracking-wider font-semibold mb-2 ${theme === "dark" ? "text-white/30" : "text-gray-400"}`}>
                      Recent Content
                    </p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className={`aspect-square rounded-lg ${theme === "dark" ? "bg-white/[0.04]" : "bg-gray-100"}`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
