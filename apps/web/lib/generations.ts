import "server-only";

// Answers being written (D6): a chat's generation by its id, so «stop» reaches the server — the client's own stop
// only lets go of the stream, and the server writes the answer to its end. In memory: one app process (D2). On
// globalThis, since the dev server bundles each route handler apart and a module copy would hold its own map.

const KEY = Symbol.for("metobe.generations");
const global = globalThis as { [KEY]?: Map<string, AbortController> };
global[KEY] ??= new Map<string, AbortController>();
const running = global[KEY];

/** A new answer in the chat: one at a time, so a new one stops what was still being written. */
export const startGeneration = (chatId: string) => {
  running.get(chatId)?.abort();
  const controller = new AbortController();
  running.set(chatId, controller);
  return controller;
};

/** The answer is done: its controller goes, unless a newer answer already took the chat. */
export const endGeneration = (chatId: string, controller: AbortController) => {
  if (running.get(chatId) === controller) {
    running.delete(chatId);
  }
};

/** Stops the chat's answer; false when nothing was being written. */
export const stopGeneration = (chatId: string) => {
  const controller = running.get(chatId);
  if (!controller) {
    return false;
  }
  controller.abort();
  running.delete(chatId);
  return true;
};
