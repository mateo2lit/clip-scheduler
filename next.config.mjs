import createMDX from '@next/mdx'
import remarkFrontmatter from 'remark-frontmatter'

const withMDX = createMDX({ options: { remarkPlugins: [remarkFrontmatter], rehypePlugins: [] } })

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['js', 'jsx', 'md', 'mdx', 'ts', 'tsx'],
  reactStrictMode: true,
  experimental: {
    after: true,
    // Mark ffmpeg-static as external so its index.js stays in node_modules
    // (where __dirname resolves correctly to the binary's actual location).
    serverComponentsExternalPackages: ["ffmpeg-static"],
    // Force the ffmpeg binary (and its package metadata) into the serverless
    // function bundle. ffmpeg-static's package.json doesn't list the binary
    // in its `files` field (it's downloaded post-install), so Next's NFT
    // tracer skips it without these explicit includes.
    // Note: in Next 14.2 this option is read from `config.experimental`
    // despite newer docs showing it at the top level.
    // Note: ffmpeg-static binary inclusion is handled via Vercel's
    // `includeFiles` in vercel.json — Next 14.2's outputFileTracingIncludes
    // doesn't reliably pick up files for App Router route handlers in this
    // repo, regardless of key format.
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default withMDX(nextConfig);
