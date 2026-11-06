import { useEffect, useRef } from "react";

// «Something about your tasks moved» (ARCH §16.5): one stream for the whole tab — the sidebar and the page of tasks
// listen to it together — and a page that is in view reads again when it hears. The word has no data in it, and a
// word nobody heard (the line was down) is no loss: on every reconnect and every return to the tab the page reads once,
// and the pages still look now and then.

type Listener = () => void;
const listeners = new Set<Listener>();
let source: EventSource | null = null;

const emit = () => {
  for (const listener of listeners) {
    listener();
  }
};

const subscribe = (listener: Listener) => {
  listeners.add(listener);
  if (!source && typeof EventSource !== "undefined") {
    const stream = new EventSource("/api/notifications/stream");
    let opened = false;
    stream.addEventListener("tasks", emit);
    stream.addEventListener("open", () => {
      // The first connection has nothing to catch up on; a later one may have missed words.
      if (opened) {
        emit();
      }
      opened = true;
    });
    source = stream;
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      source?.close();
      source = null;
    }
  };
};

/** Runs `read` — soon, once for a burst — when the server says the owner's tasks moved, and when the tab comes back. */
export const useTaskEvents = (read: () => void) => {
  const latest = useRef(read);
  useEffect(() => {
    latest.current = read;
  });
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      timer = undefined;
      if (document.visibilityState === "visible") {
        latest.current();
      }
    };
    const stop = subscribe(() => {
      if (timer === undefined) {
        timer = setTimeout(run, 400);
      }
    });
    document.addEventListener("visibilitychange", run);
    return () => {
      clearTimeout(timer);
      stop();
      document.removeEventListener("visibilitychange", run);
    };
  }, []);
};
