import { defineConfig } from "tsup";

// Workspace packages are bundled; "react-server" makes `server-only` resolve to its no-op entry.
// CommonJS dependencies bundled into ESM (socks → require("events")) need a real `require`.
const requireShim =
  'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);';

export default defineConfig({
  banner: { js: requireShim },
  entry: ["src/index.ts"],
  esbuildOptions: (options) => {
    options.conditions = ["react-server"];
  },
  format: "esm",
  noExternal: [/^@metobe\//u],
  platform: "node",
  target: "node22",
});
