/** @type {import('next').NextConfig} */
const nextConfig = {
  // IMPORTANT:
  // Do NOT use `output: "export"` for this app.
  // We rely on API routes (OAuth callbacks, worker endpoints, etc.)
  // and those cannot be used with static export.
  reactStrictMode: true,
};

module.exports = nextConfig;
