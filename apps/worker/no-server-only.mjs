// Dev only (`tsx watch --import`): `server-only` resolves to an empty module, as the worker's build aliases it — the
// worker runs without the «react-server» condition so React Email can render letters (src/no-server-only.ts).
import { register } from "node:module";

const hook = `export const resolve = (specifier, context, next) =>
  specifier === "server-only"
    ? { format: "module", shortCircuit: true, url: "data:text/javascript,export%20%7B%7D" }
    : next(specifier, context);`;

register(`data:text/javascript,${encodeURIComponent(hook)}`);
