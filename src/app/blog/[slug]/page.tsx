import { getAllPosts, getPost } from '@/lib/blog'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { evaluate } from '@mdx-js/mdx'
import * as runtime from 'react/jsx-runtime'
import remarkFrontmatter from 'remark-frontmatter'
import { useMDXComponents } from '@/mdx-components'
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";

interface Props {
  params: { slug: string }
}

export async function generateStaticParams() {
  const posts = getAllPosts()
  return posts.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = getPost(params.slug)
  if (!post) return {}
  return {
    title: `${post.title} — Clip Dash`,
    description: post.description,
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
      publishedTime: post.date,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
    },
  }
}

async function getMDXContent(slug: string) {
  const filePath = path.join(process.cwd(), 'src/content/blog', `${slug}.mdx`)
  if (!fs.existsSync(filePath)) return null
  const raw = fs.readFileSync(filePath, 'utf8')
  const { content } = matter(raw)
  const { default: Component } = await evaluate(content, {
    ...(runtime as Parameters<typeof evaluate>[1]),
    remarkPlugins: [remarkFrontmatter],
  })
  return Component
}

export default async function BlogPostPage({ params }: Props) {
  const post = getPost(params.slug)
  if (!post) notFound()

  const PostContent = await getMDXContent(params.slug)
  if (!PostContent) notFound()

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: post.title,
            description: post.description,
            datePublished: post.date,
            dateModified: post.date,
            author: {
              "@type": "Organization",
              name: "Clip Dash",
              url: "https://clipdash.org",
            },
            publisher: {
              "@type": "Organization",
              name: "Clip Dash",
              url: "https://clipdash.org",
            },
            mainEntityOfPage: {
              "@type": "WebPage",
              "@id": `https://clipdash.org/blog/${post.slug}`,
            },
            keywords: post.tags.join(", "),
          }),
        }}
      />
      {/* Nav */}
      <nav className="relative z-10 border-b border-white/5">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center justify-between">
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

      {/* Article */}
      <article className="relative z-10 mx-auto max-w-3xl px-6 pt-12 pb-24">
        {/* Back */}
        <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors mb-10">
          <ArrowLeft className="w-4 h-4" weight="bold" />
          All articles
        </Link>

        {/* Tags */}
        <div className="flex flex-wrap gap-2 mb-5">
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-white/45"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Title */}
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-tight text-white">
          {post.title}
        </h1>

        {/* Meta */}
        <div className="mt-5 flex items-center gap-4 text-sm text-white/35 border-b border-white/10 pb-8 mb-8">
          <time dateTime={post.date}>
            {new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </time>
          <span>·</span>
          <span>{post.readTime}</span>
        </div>

        {/* Content */}
        <PostContent components={useMDXComponents({})} />

        {/* CTA */}
        <div className="mt-16 rounded-2xl border border-blue-500/20 bg-blue-500/[0.05] p-8 text-center">
          <h2 className="text-xl sm:text-2xl font-bold">Ready to stop posting manually?</h2>
          <p className="mt-3 text-white/50 text-sm max-w-md mx-auto">
            Clip Dash auto-publishes to YouTube, TikTok, Instagram, Facebook, LinkedIn, and Bluesky from one upload. Start free for 7 days.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-full bg-white px-8 py-3 text-sm font-semibold text-black hover:bg-white/90 transition-colors"
          >
            Start free — 7 days free
          </Link>
        </div>
      </article>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5">
        <div className="mx-auto max-w-3xl px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-white/30">&copy; {new Date().getFullYear()} Clip Dash</div>
          <div className="flex items-center gap-6 text-sm text-white/40">
            <Link href="/blog" className="hover:text-white/70 transition-colors">Blog</Link>
            <Link href="/support" className="hover:text-white/70 transition-colors">Support</Link>
            <Link href="/login" className="hover:text-white/70 transition-colors">Get Started</Link>
          </div>
        </div>
      </footer>
    </main>
  )
}
