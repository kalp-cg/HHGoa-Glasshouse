import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@glasshouse/engine", "@glasshouse/tigergraph", "@glasshouse/chain"],
};

export default nextConfig;
