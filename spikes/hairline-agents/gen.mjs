// Carries the checked figures into the app: each <name>.js here becomes a .ts beside the engine it runs on — the
// conveyor in components/hairline (the tasks' figure), the unit in its prototype's figures.
// Edit the figure here, look at it with /hairline-create's look.mjs, then run `node gen.mjs` again.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const WEB = join(here, "../../apps/web");
const FIGURES = {
  conveyor: join(WEB, "components/hairline"),
  unit: join(WEB, "app/dev/prototypes/agent-face/figures"),
};

for (const [name, out] of Object.entries(FIGURES)) {
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
  console.log(`wrote ${join(out, name)}.ts`);
}
