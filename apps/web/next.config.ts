import { networkInterfaces } from "node:os";
import path from "node:path";

import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// This machine's own LAN addresses, so a phone on the same network can open the dev server by IP.
const lanAddresses = Object.values(networkInterfaces())
  .flat()
  .flatMap((a) => (a && a.family === "IPv4" && !a.internal ? [a.address] : []));

const nextConfig: NextConfig = {
  allowedDevOrigins: lanAddresses,
  output: "standalone",
  // Trace from the monorepo root so workspace packages end up in the standalone build.
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  reactCompiler: true,
  transpilePackages: [
    "@metobe/ui",
    "@metobe/core",
    "@metobe/contracts",
    "@metobe/db",
    "@metobe/i18n",
  ],
};

// Points next-intl at i18n/request.ts, where the language is resolved per request.
export default createNextIntlPlugin()(nextConfig);
