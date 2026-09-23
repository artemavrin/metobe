import { defineConfig } from "@playwright/test";

// Runs against a running dev stack: `docker compose ... up -d` and `pnpm dev`.
export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000" },
});
