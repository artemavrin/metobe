import { defineConfig } from "@playwright/test";

// Runs against a running stack: `docker compose ... up -d` and `pnpm dev` locally, the installed stack in CI.
// Admin tests sign in through the installation's one-time claim link (E2E_CLAIM_TOKEN, CI reads it from the
// installer's output); without it they are skipped — a dev stack is claimed already.
export const ADMIN_STATE = "e2e/.auth/admin.json";

export default defineConfig({
  projects: [
    { name: "public", testIgnore: /(?:admin\.setup|\.admin\.spec)\.ts$/u },
    { name: "admin-setup", testMatch: /admin\.setup\.ts$/u },
    {
      dependencies: ["admin-setup"],
      name: "admin",
      testMatch: /\.admin\.spec\.ts$/u,
      use: { storageState: ADMIN_STATE },
    },
  ],
  testDir: "./e2e",
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000" },
});
