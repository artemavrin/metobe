// Top self-time functions (and by file) of a .cpuprofile.
import { readFileSync } from "node:fs";
const p = JSON.parse(readFileSync(process.argv[2], "utf8"));
const byId = new Map(p.nodes.map((n) => [n.id, n]));
const self = new Map();
const dt = p.timeDeltas;
p.samples.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (dt[i] ?? 0)));
const total = [...self.values()].reduce((a, b) => a + b, 0);
const fn = new Map();
const file = new Map();
for (const [id, t] of self) {
  const c = byId.get(id).callFrame;
  const url = c.url.replace(/^.*node_modules\//, "nm/").replace(/^file:\/\/.*\/apps\/web\/\.next\/standalone\//, "app/").slice(-70);
  const key = `${c.functionName || "(anon)"} ${url}:${c.lineNumber}`;
  fn.set(key, (fn.get(key) ?? 0) + t);
  file.set(url, (file.get(url) ?? 0) + t);
}
const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, t]) => `${((t / total) * 100).toFixed(1).padStart(5)}%  ${k}`).join("\n");
console.log(`total ${(total / 1e6).toFixed(1)} s\n--- functions\n${top(fn, 25)}\n--- files\n${top(file, 15)}`);
