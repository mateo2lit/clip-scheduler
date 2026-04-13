import { ImageResponse } from 'next/og'
import { getAllPosts } from '@/lib/blog'

export const runtime = 'nodejs'

export const size = { width: 1200, height: 630 }
export const alt = 'Clip Dash Blog'
export const contentType = 'image/png'

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }))
}

export default function BlogOGImage({ params }: { params: { slug: string } }) {
  const posts = getAllPosts()
  const post = posts.find((p) => p.slug === params.slug)

  const title = post?.title ?? 'Blog Post'
  const description = post?.description ?? ''

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#0a0e17',
          fontFamily: 'system-ui, sans-serif',
          padding: '60px 80px',
        }}
      >
        {/* Subtle background gradient overlay */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background:
              'radial-gradient(ellipse 80% 60% at 50% 30%, rgba(139, 92, 246, 0.08) 0%, transparent 70%)',
            display: 'flex',
          }}
        />

        {/* Top bar: "Clip Dash Blog" */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: 28,
              fontWeight: 700,
              background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            Clip Dash
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 28,
              fontWeight: 500,
              color: '#64748b',
            }}
          >
            Blog
          </div>
        </div>

        {/* Divider */}
        <div
          style={{
            display: 'flex',
            width: 80,
            height: 3,
            borderRadius: 2,
            background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
            marginTop: 32,
            marginBottom: 40,
          }}
        />

        {/* Post title */}
        <div
          style={{
            display: 'flex',
            fontSize: 56,
            fontWeight: 800,
            color: '#f1f5f9',
            lineHeight: 1.15,
            letterSpacing: '-1.5px',
            maxWidth: '90%',
          }}
        >
          {title}
        </div>

        {/* Post description */}
        {description && (
          <div
            style={{
              display: 'flex',
              fontSize: 24,
              color: '#94a3b8',
              marginTop: 24,
              lineHeight: 1.5,
              maxWidth: '85%',
              fontWeight: 400,
            }}
          >
            {description}
          </div>
        )}

        {/* Bottom branding bar */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: 'auto',
            gap: 10,
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: 18,
              color: '#475569',
              fontWeight: 500,
            }}
          >
            clipdash.org
          </div>
          <div
            style={{
              display: 'flex',
              width: 4,
              height: 4,
              borderRadius: 2,
              backgroundColor: '#475569',
            }}
          />
          <div
            style={{
              display: 'flex',
              fontSize: 18,
              color: '#475569',
              fontWeight: 500,
            }}
          >
            Upload Once. Post Everywhere.
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
