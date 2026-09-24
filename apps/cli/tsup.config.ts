import { defineConfig } from "tsup";

// Workspace packages are bundled; "react-server" makes `server-only` resolve to its no-op entry.
export default defineConfig({
  entry: ["src/index.ts"],
  esbuildOptions: (options) => {
    options.conditions = ["react-server"];
  },
  format: "esm",
  noExternal: [/^@metobe\//u],
  platform: "node",
  target: "node22",
});
