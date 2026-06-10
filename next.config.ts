import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    parallelServerBuildTraces: false,
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
