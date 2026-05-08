import createMDX from '@next/mdx'
import remarkFrontmatter from 'remark-frontmatter'

const withMDX = createMDX({ options: { remarkPlugins: [remarkFrontmatter], rehypePlugins: [] } })

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['js', 'jsx', 'md', 'mdx', 'ts', 'tsx'],
  reactStrictMode: true,
  experimental: {
    after: true,
    // Keep ffmpeg-static unbundled (this only affects Server Components, but
    // we keep it for parity with the webpack rule below).
    serverComponentsExternalPackages: ["ffmpeg-static"],
  },
  // Belt-and-suspenders for ffmpeg-static: mark it external in the server
  // webpack build so its index.js (and __dirname-based binary path) stays
  // in node_modules instead of being relocated into .next/server/chunks
  // — which produces "spawn .../chunks/ffmpeg ENOENT" at runtime.
  webpack: (config, { isServer }) => {
    if (isServer) {
      const externals = config.externals;
      if (Array.isArray(externals)) {
        externals.push({ "ffmpeg-static": "commonjs ffmpeg-static" });
      } else if (typeof externals === "function") {
        const original = externals;
        config.externals = async (ctx, ...rest) => {
          if (ctx.request === "ffmpeg-static") return "commonjs ffmpeg-static";
          return original(ctx, ...rest);
        };
      } else {
        config.externals = [{ "ffmpeg-static": "commonjs ffmpeg-static" }];
      }
    }
    return config;
  },
  // Ensure the ffmpeg binary itself is shipped into the serverless function
  // (the externals rule keeps the JS reference, this carries the binary).
  outputFileTracingIncludes: {
    "/api/worker/run-scheduled": ["./node_modules/ffmpeg-static/**"],
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
