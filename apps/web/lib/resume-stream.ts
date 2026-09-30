import "server-only";
import type { UIMessageChunk } from "ai";

// The answer being written, kept while it is (D5): a reader who comes late — a page reloaded in the middle of an
// answer — gets what has been written so far and then follows the rest live. The server writes the answer to its end
// whatever the client does (the stream is read here, not by the client), so the answer is there to come back to.
// In memory: one app process (D2), as the generations are; another instance would keep the chunks in Redis instead
// (`resumable-stream`) — only this file would change. On globalThis for the same reason as there: the dev server
// bundles each route handler apart.

interface Live {
  chunks: UIMessageChunk[];
  done: boolean;
  wake: Set<() => void>;
}

const KEY = Symbol.for("metobe.resumableStreams");
const global = globalThis as { [KEY]?: Map<string, Live> };
global[KEY] ??= new Map<string, Live>();
const live = global[KEY];

// A safety net: whatever happens to the save, a finished answer's chunks do not stay for ever.
const KEEP_AFTER_END_MS = 120_000;

/**
 * What a reader who comes late gets of what is already written: the same chunks, with the deltas that follow each other
 * — the words of a text, of a reasoning, the input of a tool — joined into one. Played as they were written, the
 * answer would type itself out again from its first word on the reloaded page; joined, it is there at once, and the
 * live chunks that follow carry it on. A delta with metadata of its own is left alone.
 */
export const catchUp = (chunks: UIMessageChunk[]) => {
  const out: UIMessageChunk[] = [];
  for (const chunk of chunks) {
    // A clock of the past is of no use to a reader who comes now: he gets his own, after all of it.
    if (chunk.type === "data-clock") {
      continue;
    }
    const last = out.at(-1);
    if (
      last &&
      (chunk.type === "text-delta" || chunk.type === "reasoning-delta") &&
      last.type === chunk.type &&
      last.id === chunk.id &&
      !last.providerMetadata &&
      !chunk.providerMetadata
    ) {
      out[out.length - 1] = { ...last, delta: last.delta + chunk.delta };
    } else if (
      last &&
      chunk.type === "tool-input-delta" &&
      last.type === "tool-input-delta" &&
      last.toolCallId === chunk.toolCallId
    ) {
      out[out.length - 1] = {
        ...last,
        inputTextDelta: last.inputTextDelta + chunk.inputTextDelta,
      };
    } else {
      out.push(chunk);
    }
  }
  return out;
};

/**
 * Starts keeping the answer of a chat: reads `source` to its end and stores each chunk. Returns what to call once
 * the answer is saved — from then on the saved copy is the one to show, and a late reader gets none.
 */
export const recordStream = (
  chatId: string,
  source: ReadableStream<UIMessageChunk>
) => {
  const entry: Live = { chunks: [], done: false, wake: new Set() };
  live.set(chatId, entry);
  const notify = () => {
    // Taken out first: a woken reader asks to be woken again from inside its own wake-up.
    const waiting = [...entry.wake];
    entry.wake.clear();
    for (const wake of waiting) {
      wake();
    }
  };
  // An answer that replaced this one in the chat is not ours to remove.
  const forget = () => {
    if (live.get(chatId) === entry) {
      live.delete(chatId);
    }
  };
  const finish = () => {
    entry.done = true;
    notify();
    setTimeout(forget, KEEP_AFTER_END_MS).unref();
  };
  const keep = async () => {
    try {
      await source.pipeTo(
        new WritableStream<UIMessageChunk>({
          write(chunk) {
            entry.chunks.push(chunk);
            notify();
          },
        })
      );
    } catch {
      // The answer ended badly: what was written stays, and the readers are let go below.
    } finally {
      finish();
    }
  };
  // Not awaited: it runs alongside the answer.
  keep();
  return forget;
};

/** The chat's answer from its start and on, as it comes; null when none is being written. */
export const resumeStream = (chatId: string) => {
  const entry = live.get(chatId);
  if (!entry) {
    return null;
  }
  let next = 0;
  let cancelled = false;
  return new ReadableStream<UIMessageChunk>({
    cancel() {
      cancelled = true;
    },
    // Everything written so far goes out at once, then the reader is woken as more comes and, at the end, closed. What
    // is kept is in memory already, so there is nothing for a slow reader to hold back.
    start(controller) {
      // What is written by now goes out joined, in one piece; what comes after — as it comes.
      const written = entry.chunks.length;
      for (const chunk of catchUp(entry.chunks.slice(0, written))) {
        controller.enqueue(chunk);
      }
      controller.enqueue({
        data: Date.now(),
        transient: true,
        type: "data-clock",
      } as UIMessageChunk);
      next = written;
      const flush = () => {
        if (cancelled) {
          return;
        }
        while (next < entry.chunks.length) {
          controller.enqueue(entry.chunks[next] as UIMessageChunk);
          next += 1;
        }
        if (entry.done) {
          controller.close();
          return;
        }
        entry.wake.add(flush);
      };
      flush();
    },
  });
};
