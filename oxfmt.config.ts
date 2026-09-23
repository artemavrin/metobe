import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

// Generated code: registry UI components, the Better Auth schema and release-please files.
const generated = [
  "packages/ui/src/components/**",
  "packages/db/src/schema/auth.ts",
  "CHANGELOG.md",
  ".release-please-manifest.json",
];

export default defineConfig({
  ...ultracite,
  ignorePatterns: [...(ultracite.ignorePatterns ?? []), ...generated],
});
