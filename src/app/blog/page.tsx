import { getAllPosts } from '@/lib/blog'
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Blog — Clip Dash',
  description: 'Guides, tips, and workflows for video creators who want to cross-post faster across YouTube, TikTok, Instagram, Facebook, LinkedIn, and Bluesky.',
  openGraph: {
    title: 'Blog — Clip Dash',
    description: 'Guides and tips for video creators scheduling content across 6 platforms.',
    type: 'website',
  },
}

export default function BlogPage() {
  const posts = getAllPosts()

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      {/* Background gradient */}

      {/* Nav */}
      <nav className="relative z-10 border-b border-white/5">
        <div className="mx-auto max-w-4xl px-6 py-4 flex items-center justify-between">
          <Link href="/">
            <img src="/logo.svg" alt="Clip Dash" className="h-10 w-auto" />
          </Link>
          <Link
            href="/login"
            className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-white/90 transition-colors"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Header */}
      <section className="relative z-10 mx-auto max-w-4xl px-6 pt-16 pb-10">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">Blog</h1>
        <p className="mt-4 text-white/45 text-lg max-w-xl">
          Guides and workflows for video creators who want to stop posting manually and start growing.
        </p>
      </section>

      {/* Post list */}
      <section className="relative z-10 mx-auto max-w-4xl px-6 pb-24">
        <div className="space-y-4">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group block rounded-2xl border border-white/10 bg-white/[0.02] p-6 hover:bg-white/[0.04] hover:border-white/20 transition-all"
            >
              <div className="flex flex-wrap gap-2 mb-3">
                {post.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-white/45"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <h2 className="text-lg sm:text-xl font-semibold group-hover:text-white transition-colors">
                {post.title}
              </h2>
              <p className="mt-2 text-sm text-white/50 leading-relaxed line-clamp-2">{post.description}</p>
              <div className="mt-4 flex items-center gap-4 text-xs text-white/30">
                <time dateTime={post.date}>
                  {new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </time>
                <span>·</span>
                <span>{post.readTime}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5">
        <div className="mx-auto max-w-4xl px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-white/30">&copy; {new Date().getFullYear()} Clip Dash</div>
          <div className="flex items-center gap-6 text-sm text-white/40">
            <Link href="/" className="hover:text-white/70 transition-colors">Home</Link>
            <Link href="/support" className="hover:text-white/70 transition-colors">Support</Link>
            <Link href="/login" className="hover:text-white/70 transition-colors">Get Started</Link>
          </div>
        </div>
      </footer>
    </main>
  )
}
