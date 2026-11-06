import { defineConfig } from "tsup";

// Workspace packages are bundled. `server-only` points to an empty module: the worker runs without the «react-server»
// condition, which would take `react-dom/server` away from React Email's letters (src/no-server-only.ts).
// CommonJS dependencies bundled into ESM (socks → require("events")) need a real `require`.
const requireShim =
  'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);';

export default defineConfig({
  banner: { js: requireShim },
  entry: ["src/index.ts", "src/updater.ts"],
  esbuildOptions: (options) => {
    options.alias = { "server-only": "./src/no-server-only.ts" };
  },
  format: "esm",
  noExternal: [/^@metobe\//u],
  platform: "node",
  target: "node22",
});
