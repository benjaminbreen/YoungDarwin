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
  // Without this, Vercel serves everything under public/ with max-age=0 and
  // every returning player re-validates every GLB/texture/book — a waterfall
  // of 304 round-trips on each visit. One hour fresh + a day of
  // stale-while-revalidate makes repeat loads render from cache immediately
  // while updates still propagate within the hour. Not `immutable`: only a
  // third of model manifest entries carry a ?v= cacheKey, and textures/books
  // /audio URLs are unversioned.
  async headers() {
    return [
      {
        source: '/assets/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, stale-while-revalidate=86400',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
