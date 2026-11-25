import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// The app's files are imported as they are; `server-only` only guards the browser bundle.
export default defineConfig({
  // packages/core's tsconfig extends a workspace package the spike does not install: do not read it.
  tsconfig: "tsconfig.json",
  resolve: {
    alias: {
      "server-only": fileURLToPath(
        new URL("stubs/server-only.ts", import.meta.url)
      ),
    },
  },
  test: { include: ["*.test.ts"], testTimeout: 20_000 },
});
