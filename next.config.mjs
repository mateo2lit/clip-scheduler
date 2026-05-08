import createMDX from '@next/mdx'
import remarkFrontmatter from 'remark-frontmatter'

const withMDX = createMDX({ options: { remarkPlugins: [remarkFrontmatter], rehypePlugins: [] } })

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['js', 'jsx', 'md', 'mdx', 'ts', 'tsx'],
  reactStrictMode: true,
  experimental: {
    after: true,
    serverComponentsExternalPackages: ["ffmpeg-static"],
  },
  // ffmpeg-static is needed inside the run-scheduled worker route to remux
  // QuickTime-wrapped videos into true MP4 before posting to Bluesky. Three
  // pieces work together:
  //   1. side-effect `import "ffmpeg-static"` in src/lib/videoRemux.ts so
  //      Next's NFT tracer sees the dependency and ships it (plus its
  //      post-install-downloaded binary) to the serverless function;
  //   2. eval("require")("ffmpeg-static") at call time so webpack cannot
  //      relocate the package into chunks/ and break the __dirname-based
  //      binary path lookup;
  //   3. this externals rule so the static import itself isn't bundled.
  webpack: (config, { isServer }) => {
    if (isServer) {
      const existing = config.externals;
      const arr = Array.isArray(existing) ? existing : existing ? [existing] : [];
      arr.push({ "ffmpeg-static": "commonjs ffmpeg-static" });
      config.externals = arr;
    }
    return config;
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
