import path from "node:path";

import { defineConfig } from "vitest/config";

const core = path.resolve(import.meta.dirname, "../../packages/core");

export default defineConfig({
  resolve: {
    // What next.js gives server code: `server-only` is a no-op there.
    alias: {
      "server-only": path.join(core, "node_modules/server-only/empty.js"),
    },
  },
  test: { fileParallelism: false, include: ["*.test.ts"], testTimeout: 30_000 },
});
