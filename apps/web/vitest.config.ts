import { defineConfig } from "vitest/config";

// The app's `@/` alias (tsconfig `paths`), for tests that load a route or a module that imports through it.
export default defineConfig({
  resolve: {
    alias: { "@": import.meta.dirname },
  },
});
