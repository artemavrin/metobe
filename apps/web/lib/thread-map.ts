import type { ChatMessage } from "@metobe/contracts/chat";

import type { ThreadRow } from "@/lib/thread-rows";

// The map at the thread's left edge (after T3 Code's timeline minimap): a strip per question, the question and the
// start of its answer on hover, a click goes there. Pure: the component measures, this counts.

export interface ThreadMapItem {
  /** The question's row key — the scroller's message id. */
  id: string;
  /** Its answer's row key, to tell when the answer is what is on screen. */
  answerId: string | null;
  question: string;
  answer: string | null;
}

/** Strips this far apart until the rail would outgrow the screen; then they close up. */
export const MAP_SPACING = 8;
/** One question needs no map. */
export const MAP_MIN_ITEMS = 2;
/** A side margin this wide keeps the map shown; a narrower one shows it on hover only. */
export const MAP_PERSISTENT_GUTTER = 48;
const HIT_LEFT = 12;
const HIT_MAX = 40;

/** Words only, in one line: the text, not the steps or tool calls — and not its markdown either. */
const plain = (message?: ChatMessage) => {
  const text =
    message?.parts
      .flatMap((p) => (p.type === "text" ? [p.text] : []))
      .join("\n")
      // A table's rule line goes; its cells read as a list.
      .replaceAll(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gmu, "")
      .replaceAll(/^#{1,6}\s+/gmu, "")
      .replaceAll(/\*\*|__|`/gu, "")
      .replaceAll(/^[ \t]*\||\|[ \t]*$/gmu, "")
      .replaceAll(/[ \t]*\|[ \t]*/gu, " · ")
      .replaceAll(/\s+/gu, " ")
      .trim() ?? "";
  return text || null;
};

export const threadMapItems = (rows: ThreadRow[]): ThreadMapItem[] => {
  const items: ThreadMapItem[] = [];
  for (const row of rows) {
    if (row.role === "user") {
      items.push({
        answer: null,
        answerId: null,
        id: row.key,
        question: plain(row.message) ?? "",
      });
    } else if (row.role === "assistant") {
      const last = items.at(-1);
      if (last) {
        last.answerId = row.key;
        last.answer = plain(row.message);
      }
    }
  }
  return items;
};

/** Where a strip sits on the rail, 0–100 %. */
export const topPercent = (index: number, count: number) =>
  count <= 1
    ? 0
    : (Math.max(0, Math.min(index, count - 1)) / (count - 1)) * 100;

/** The rail's height: the strips' own, but never past the screen. */
export const railHeight = (count: number) =>
  `min(${Math.max(1, (count - 1) * MAP_SPACING)}px, calc(100dvh - 18rem))`;

/** The strip under the pointer: by its place on the rail, so the whole rail is one target. */
export const indexAt = (
  count: number,
  top: number,
  height: number,
  y: number
) => {
  if (count <= 0 || height <= 0) {
    return null;
  }
  const progress = Math.max(0, Math.min(1, (y - top) / height));
  return Math.round(progress * (count - 1));
};

/** The free margin beside the centred column; the map lives in it. */
export const sideGutter = (width: number, column: number) =>
  Math.max(0, (width - Math.min(width, column)) / 2);

/** How wide the rail takes the pointer: never into the column, or it would steal the text's clicks; 0 — not at all. */
export const hitWidth = (gutter: number) =>
  Math.max(0, Math.min(HIT_MAX, Math.floor(gutter) - HIT_LEFT));
