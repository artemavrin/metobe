import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

// Generated code: registry UI components, the Better Auth schema and release-please files. Spikes and UI prototypes are throwaway.
// Hairline's engine is copied from its package, and a figure on it kept line for line with its spike.
const generated = [
  "packages/ui/src/components/**",
  "packages/ui/src/hooks/use-mobile.ts",
  "packages/db/src/schema/auth.ts",
  "apps/web/components/hairline/**",
  "CHANGELOG.md",
  ".release-please-manifest.json",
  "spikes/**",
  "apps/web/app/dev/prototypes/**",
];

export default defineConfig({
  ...ultracite,
  ignorePatterns: [...(ultracite.ignorePatterns ?? []), ...generated],
});
