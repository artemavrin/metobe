import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Trace from the monorepo root so workspace packages end up in the standalone build.
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  reactCompiler: true,
  transpilePackages: ["@purr/ui", "@purr/core", "@purr/contracts", "@purr/db"],
};

export default nextConfig;
