import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactCompiler: true,
  transpilePackages: ["@purr/ui", "@purr/core", "@purr/contracts", "@purr/db"],
};

export default nextConfig;
