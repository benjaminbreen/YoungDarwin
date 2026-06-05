import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    parallelServerBuildTraces: false,
  },
};

export default nextConfig;
