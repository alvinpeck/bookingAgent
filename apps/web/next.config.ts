import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile workspace packages
  transpilePackages: ["@booking-agent/db", "@booking-agent/trpc"],

  experimental: {
    // Required for tRPC server-side callers in Server Components
    serverComponentsExternalPackages: ["postgres"],
  },
};

export default nextConfig;
