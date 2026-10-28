import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@glasshouse/engine", "@glasshouse/tigergraph"],
};

export default nextConfig;
