import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export const size = { width: 1200, height: 630 }
export const alt = 'Clip Dash – Upload Once. Post Everywhere.'
export const contentType = 'image/png'

const platforms = ['YouTube', 'TikTok', 'Instagram', 'Facebook', 'LinkedIn', 'Bluesky', 'X']

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0a0e17',
          fontFamily: 'system-ui, sans-serif',
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
              'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(59, 130, 246, 0.08) 0%, transparent 70%)',
            display: 'flex',
          }}
        />

        {/* Brand name */}
        <div
          style={{
            display: 'flex',
            fontSize: 72,
            fontWeight: 800,
            letterSpacing: '-2px',
            background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
            backgroundClip: 'text',
            color: 'transparent',
            lineHeight: 1.1,
          }}
        >
          Clip Dash
        </div>

        {/* Tagline */}
        <div
          style={{
            display: 'flex',
            fontSize: 32,
            color: '#94a3b8',
            marginTop: 16,
            fontWeight: 500,
            letterSpacing: '-0.5px',
          }}
        >
          Upload Once. Post Everywhere.
        </div>

        {/* Divider */}
        <div
          style={{
            display: 'flex',
            width: 120,
            height: 3,
            borderRadius: 2,
            background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
            marginTop: 40,
            marginBottom: 40,
          }}
        />

        {/* Platforms row */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 20,
          }}
        >
          {platforms.map((name) => (
            <div
              key={name}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '10px 22px',
                borderRadius: 9999,
                border: '1px solid rgba(148, 163, 184, 0.2)',
                backgroundColor: 'rgba(148, 163, 184, 0.05)',
                fontSize: 18,
                fontWeight: 600,
                color: '#cbd5e1',
              }}
            >
              {name}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  )
}
