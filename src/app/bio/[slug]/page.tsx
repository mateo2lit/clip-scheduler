"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type BioPage = {
  display_name: string;
  bio: string;
  avatar_url: string | null;
  theme: string;
  accent_color: string;
  show_recent_posts: boolean;
};

type BioLink = {
  id: string;
  title: string;
  url: string;
  icon: string | null;
  clicks: number;
};

type RecentPost = {
  id: string;
  title: string;
  description: string;
  provider: string;
  thumbnail_url: string | null;
  permalink: string | null;
  posted_at: string;
};

export default function PublicBioPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [page, setPage] = useState<BioPage | null>(null);
  const [links, setLinks] = useState<BioLink[]>([]);
  const [posts, setPosts] = useState<RecentPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;

    fetch(`/api/bio/${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.ok) {
          setPage(json.page);
          setLinks(json.links || []);
          setPosts(json.recentPosts || []);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  function trackClick(linkId: string) {
    fetch(`/api/bio/${encodeURIComponent(slug)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkId }),
    }).catch(() => {});
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !page) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center text-white">
        <h1 className="text-4xl font-bold mb-2">404</h1>
        <p className="text-white/40">This bio page doesn't exist</p>
      </div>
    );
  }

  const isDark = page.theme === "dark";

  return (
    <div
      className={`min-h-screen ${isDark ? "bg-[#050505] text-white" : "bg-gray-50 text-gray-900"}`}
    >
      <div className="mx-auto max-w-lg px-6 py-12">
        {/* Profile */}
        <div className="text-center mb-8">
          {page.avatar_url ? (
            <img
              src={page.avatar_url}
              alt={page.display_name}
              className="w-20 h-20 rounded-full mx-auto mb-4 object-cover border-2"
              style={{ borderColor: page.accent_color }}
            />
          ) : (
            <div
              className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center text-2xl font-bold"
              style={{ background: page.accent_color + "30", color: page.accent_color }}
            >
              {page.display_name?.[0]?.toUpperCase() || "?"}
            </div>
          )}
          <h1 className="text-xl font-bold">{page.display_name}</h1>
          {page.bio && (
            <p className={`mt-2 text-sm ${isDark ? "text-white/50" : "text-gray-500"}`}>
              {page.bio}
            </p>
          )}
        </div>

        {/* Links */}
        {links.length > 0 && (
          <div className="space-y-3 mb-10">
            {links.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackClick(link.id)}
                className={`block w-full rounded-2xl border px-5 py-4 text-center font-medium transition-all hover:scale-[1.02] active:scale-[0.98] ${
                  isDark
                    ? "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]"
                    : "border-gray-200 bg-white hover:bg-gray-50 shadow-sm"
                }`}
                style={{
                  borderColor: page.accent_color + "30",
                }}
              >
                <span className="text-sm">{link.title}</span>
              </a>
            ))}
          </div>
        )}

        {/* Recent posts grid */}
        {page.show_recent_posts && posts.length > 0 && (
          <div>
            <h2
              className={`text-xs uppercase tracking-wider font-semibold mb-4 ${
                isDark ? "text-white/40" : "text-gray-400"
              }`}
            >
              Recent Content
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {posts.map((post) => {
                const Wrapper: any = post.permalink ? "a" : "div";
                const wrapperProps = post.permalink
                  ? { href: post.permalink, target: "_blank", rel: "noopener noreferrer" }
                  : {};
                return (
                  <Wrapper
                    key={post.id}
                    {...wrapperProps}
                    className={`block aspect-square rounded-xl overflow-hidden relative group ${
                      isDark ? "bg-white/[0.04]" : "bg-gray-100"
                    }`}
                  >
                    {post.thumbnail_url ? (
                      <img
                        src={post.thumbnail_url}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        onError={(e) => {
                          // If thumbnail fails to load, hide the img and let the fallback show
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : null}
                    {/* Fallback / overlay shown when no thumbnail or on image error */}
                    <div
                      className={`absolute inset-0 flex items-center justify-center p-2 ${
                        post.thumbnail_url
                          ? "opacity-0 group-hover:opacity-100 bg-black/60 transition-opacity"
                          : ""
                      }`}
                    >
                      <p
                        className={`text-[10px] text-center line-clamp-3 font-medium ${
                          post.thumbnail_url
                            ? "text-white"
                            : isDark
                              ? "text-white/40"
                              : "text-gray-500"
                        }`}
                      >
                        {post.title}
                      </p>
                    </div>
                  </Wrapper>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 text-center">
          <a
            href="/"
            className={`text-[10px] ${isDark ? "text-white/20 hover:text-white/30" : "text-gray-300 hover:text-gray-400"} transition-colors`}
          >
            Powered by ClipDash
          </a>
        </div>
      </div>
    </div>
  );
}
