import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

// Generated code: registry UI components and the Better Auth schema.
const generated = [
  "packages/ui/src/components/**",
  "packages/db/src/schema/auth.ts",
];

export default defineConfig({
  ...ultracite,
  ignorePatterns: [...(ultracite.ignorePatterns ?? []), ...generated],
});
