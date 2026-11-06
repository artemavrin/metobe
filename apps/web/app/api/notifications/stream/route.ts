import { onTasksChanged } from "@metobe/core/task-events";
import { headers } from "next/headers";

import { getAuth } from "@/lib/auth";

// «Something about your tasks moved» as server-sent events (ARCH §16.5). The word carries no data: the page that hears
// it reads what it needs by its own request, so a stream holds nothing to leak. A line every 20 s keeps proxies from
// closing it; a page that goes away ends it (the request's signal).

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 20_000;
const encoder = new TextEncoder();

export const GET = async (request: Request) => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const ownerId = session.user.id;
  const ending: { stop?: () => void } = {};
  const stream = new ReadableStream({
    cancel() {
      ending.stop?.();
    },
    start(controller) {
      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          ending.stop?.();
        }
      };
      const unsubscribe = onTasksChanged((id) => {
        if (id === ownerId) {
          send("event: tasks\ndata: {}\n\n");
        }
      });
      const beat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);
      const stop = () => {
        clearInterval(beat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      ending.stop = stop;
      request.signal.addEventListener("abort", stop, { once: true });
      // How long a browser waits before it connects again, as it does by itself when the line drops.
      send("retry: 3000\n\n");
    },
  });
  return new Response(stream, {
    headers: {
      "cache-control": "no-cache, no-transform",
      "content-type": "text/event-stream; charset=utf-8",
      "x-accel-buffering": "no",
    },
  });
};
