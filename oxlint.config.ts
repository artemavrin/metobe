import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import next from "ultracite/oxlint/next";
import react from "ultracite/oxlint/react";

// Registry components (shadcn, ReUI, EvilCharts) are vendored and updated via `shadcn add --diff`.
const vendored = ["packages/ui/src/components/**"];

export default defineConfig({
  extends: [core, next, react],
  ignorePatterns: [...(core.ignorePatterns ?? []), ...vendored],
});
