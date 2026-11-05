// Carries the checked figures into the prototypes: each <name>.js here becomes <prototype>/figures/<name>.ts under
// apps/web/app/dev/prototypes, the same code run on the engine in components/hairline.
// Edit the figure here, look at it with /hairline-create's look.mjs, then run `node gen.mjs` again.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const FIGURES = { conveyor: "first-agent", unit: "agent-face" };

for (const [name, proto] of Object.entries(FIGURES)) {
  const out = join(here, "../../apps/web/app/dev/prototypes", proto, "figures");
  mkdirSync(out, { recursive: true });
  const src = readFileSync(join(here, `${name}.js`), "utf8");
  const at = src.lastIndexOf("hairline({");
  if (at < 0) throw new Error(`${name}.js: no hairline({ … }) call`);
  const body = `${src.slice(0, at)}return ({${src.slice(at + "hairline({".length)}`;
  writeFileSync(
    join(out, `${name}.ts`),
    `// @ts-nocheck -- generated from spikes/hairline-agents/${name}.js by gen.mjs; edit it there and run gen.mjs again.\n` +
      `/* oxlint-disable */\nimport { HL } from "./hl";\n\nconst figure = (() => {\n${body}\n})();\n\nexport default figure;\n`
  );
  console.log(`wrote ${proto}/figures/${name}.ts`);
}
