import { useEffect, useRef } from "react";

import { subscribeOwnerStream } from "@/lib/owner-stream";

// «Something about your tasks moved» (ARCH §16.5): one stream for the whole tab (lib/owner-stream) — the sidebar and
// the page of tasks listen to it together — and a page that is in view reads again when it hears. The word has no data in it, and a
// word nobody heard (the line was down) is no loss: on every reconnect and every return to the tab the page reads once,
// and the pages still look now and then.

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
    const stop = subscribeOwnerStream("tasks", () => {
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
