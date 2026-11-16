import { defineConfig } from "tsup";

// Workspace packages are bundled. `server-only` points to an empty module: the worker runs without the «react-server»
// condition, which would take `react-dom/server` away from React Email's letters (src/no-server-only.ts).
// CommonJS dependencies bundled into ESM (socks → require("events")) need a real `require`.
// Under its own name: a bundled dependency may import `createRequire` itself (msgpackr does), and two top-level
// bindings of one name are a SyntaxError that keeps the bundle from starting.
const requireShim =
  'import { createRequire as createMetobeRequire } from "node:module"; const require = createMetobeRequire(import.meta.url);';

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
