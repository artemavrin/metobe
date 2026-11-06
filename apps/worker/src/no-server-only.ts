// `server-only` throws unless a module is loaded under the «react-server» condition. The worker cannot take that
// condition: under it React gives no `react-dom/server`, and React Email renders a task's letter with it. So the
// worker's own build points `server-only` here — an empty module (tsup.config.ts), and dev does the same with a
// loader hook (no-server-only.mjs).
export const serverOnly = false;
