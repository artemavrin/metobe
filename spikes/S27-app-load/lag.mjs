// Preloaded into the app process (NODE_OPTIONS=--import): once a second appends RSS, heap, CPU share and event-loop
// delay to $S27_LAG_FILE. No product code is touched.
import { appendFileSync } from "node:fs";
import { monitorEventLoopDelay } from "node:perf_hooks";

const file = process.env.S27_LAG_FILE;
if (file) {
  const histogram = monitorEventLoopDelay({ resolution: 10 });
  histogram.enable();
  let cpu = process.cpuUsage();
  let at = performance.now();
  const ms = (ns) => Math.round(ns / 1e4) / 100;
  // SIGUSR2: a full GC, then one line with what is still alive (needs --expose-gc): the heap a busy plateau really holds.
  process.on("SIGUSR2", () => {
    globalThis.gc?.();
    const mem = process.memoryUsage();
    appendFileSync(
      file,
      `${JSON.stringify({ arrayBuffers: mem.arrayBuffers, external: mem.external, gc: true, heapUsed: mem.heapUsed, pid: process.pid, rss: mem.rss, t: Date.now() })}\n`
    );
  });
  setInterval(() => {
    const now = performance.now();
    const used = process.cpuUsage(cpu);
    const mem = process.memoryUsage();
    const line = {
      arrayBuffers: mem.arrayBuffers,
      cpu: Math.round(((used.user + used.system) / 1000 / (now - at)) * 1000) / 10,
      external: mem.external,
      heapUsed: mem.heapUsed,
      lagMax: ms(histogram.max),
      lagMean: ms(histogram.mean),
      lagP50: ms(histogram.percentile(50)),
      lagP99: ms(histogram.percentile(99)),
      pid: process.pid,
      rss: mem.rss,
      t: Date.now(),
    };
    appendFileSync(file, `${JSON.stringify(line)}\n`);
    histogram.reset();
    cpu = process.cpuUsage();
    at = now;
  }, 1000).unref();
}

// S27_PROF=<file>: a CPU profile of the whole run, written on SIGHUP (in-process inspector; no product code touched).
if (process.env.S27_PROF) {
  const { Session } = await import("node:inspector");
  const { writeFileSync } = await import("node:fs");
  const session = new Session();
  session.connect();
  session.post("Profiler.enable");
  session.post("Profiler.setSamplingInterval", { interval: 1000 });
  session.post("Profiler.start");
  process.on("SIGHUP", () => {
    session.post("Profiler.stop", (error, { profile }) => {
      if (!error) writeFileSync(process.env.S27_PROF, JSON.stringify(profile));
      console.log("profile written");
    });
  });
}
