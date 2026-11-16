import { defineConfig } from "tsup";

// Workspace packages are bundled; "react-server" makes `server-only` resolve to its no-op entry.
// CommonJS dependencies bundled into ESM (socks → require("events")) need a real `require`.
// Under its own name: a bundled dependency may import `createRequire` itself (msgpackr does), and two top-level
// bindings of one name are a SyntaxError that keeps the bundle from starting.
const requireShim =
  'import { createRequire as createMetobeRequire } from "node:module"; const require = createMetobeRequire(import.meta.url);';

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
