import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    parallelServerBuildTraces: false,
  },
  // The animation contact-sheet endpoint is a loopback-only development tool.
  // Its dynamic output paths must not make the production function trace the
  // runtime asset library or locally generated review sheets.
  outputFileTracingExcludes: {
    '/api/animation-contact-sheet': [
      './public/**/*',
      './test-results/**/*',
    ],
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
