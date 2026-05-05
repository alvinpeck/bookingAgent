import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile workspace packages
  transpilePackages: ["@booking-agent/db", "@booking-agent/trpc"],

  serverExternalPackages: ["postgres"],
};

export default nextConfig;
