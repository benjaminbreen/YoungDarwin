import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    parallelServerBuildTraces: false,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
