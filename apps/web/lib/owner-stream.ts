// The owner's words from the server (ARCH §16.5, §19), one stream for the whole tab: «your tasks moved» and «this
// chat's memory moved». Each listener hears its own kind; on a reconnect everyone hears once, with nothing in it — a
// word may have been missed while the line was down, so they read again.

type Kind = "tasks" | "memory";
type Listener = (data: unknown) => void;

const listeners: Record<Kind, Set<Listener>> = {
  memory: new Set(),
  tasks: new Set(),
};
let source: EventSource | null = null;

const emit = (kind: Kind, data: unknown) => {
  for (const listener of listeners[kind]) {
    listener(data);
  }
};

const dataOf = (event: Event) => {
  try {
    return JSON.parse((event as MessageEvent<string>).data) as unknown;
  } catch {
    return null;
  }
};

export const subscribeOwnerStream = (kind: Kind, listener: Listener) => {
  listeners[kind].add(listener);
  if (!source && typeof EventSource !== "undefined") {
    const stream = new EventSource("/api/notifications/stream");
    let opened = false;
    stream.addEventListener("tasks", () => emit("tasks", null));
    stream.addEventListener("memory", (event) => emit("memory", dataOf(event)));
    stream.addEventListener("open", () => {
      // The first connection has nothing to catch up on; a later one may have missed words.
      if (opened) {
        emit("tasks", null);
        emit("memory", null);
      }
      opened = true;
    });
    source = stream;
  }
  return () => {
    listeners[kind].delete(listener);
    if (listeners.tasks.size + listeners.memory.size === 0) {
      source?.close();
      source = null;
    }
  };
};
