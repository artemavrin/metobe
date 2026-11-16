import type { ChatMessage } from "@metobe/contracts/chat";
import type { MemoryRecordView } from "@metobe/contracts/memory";
import type { LetterBlock } from "@metobe/emails/blocks";
import type { Locale } from "@metobe/i18n/config";

import { letterBlocks } from "./letter-blocks";
import type { TelegramOrigin } from "./telegram";

// Messages to the bot (шаг 7) as words, and the answer as Telegram shows it — no base, no model: what a message says
// (its text, the caption under a file; a forwarded one marked as someone else's), and an answer's parts as blocks.

// ── What a Telegram message says ────────────────────────────────────────────────────────────────────────────────────

/** Who a forwarded message is from, as the person would name them; null — not said. */
export const originName = (origin: TelegramOrigin) => {
  const person = origin.sender_user
    ? [origin.sender_user.first_name, origin.sender_user.last_name]
        .filter(Boolean)
        .join(" ")
    : "";
  return (
    person ||
    origin.sender_user_name ||
    origin.sender_chat?.title ||
    origin.chat?.title ||
    null
  );
};

/**
 * A message's words as the chat keeps them: its text, or the caption under a file. A forwarded one begins with
 * «Переслано от …» — the memory's writer reads everything from that line on as someone else's (`splitQuoted`).
 */
export const messageText = (
  message: {
    text?: string;
    caption?: string;
    forward_origin?: TelegramOrigin;
  },
  forwarded: (name: string | null) => string
) => {
  const words = (message.text ?? message.caption ?? "").trim();
  if (!words) {
    return null;
  }
  return message.forward_origin
    ? `${forwarded(originName(message.forward_origin))}\n${words}`
    : words;
};

// ── The answer as Telegram shows it ─────────────────────────────────────────────────────────────────────────────────

/** Words for what `show_card` and `show_promises` leave in an answer, said as lines. */
export interface ShownWords {
  due: (date: string) => string;
  late: string;
  more: (count: number) => string;
}

const otherSide = (r: MemoryRecordView) =>
  r.entities.find((e) => e.kind !== "self")?.name ?? null;

/** `2026-11-14`: a moment's day in the zone. */
const dayKeyIn = (iso: string | Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso));

/** An open promise as a line: its text, by when (and that it is late), with whom. */
const promiseItem = (
  r: MemoryRecordView,
  today: string,
  words: ShownWords,
  day: (iso: string) => string,
  timeZone: string
) => {
  const notes = [
    r.dueAt
      ? `${words.due(day(r.dueAt))}${dayKeyIn(r.dueAt, timeZone) < today ? `, ${words.late}` : ""}`
      : null,
    otherSide(r),
  ].filter(Boolean);
  return {
    text: notes.length > 0 ? `${r.text} — ${notes.join(" · ")}` : r.text,
  };
};

/**
 * The words of an answer's last step, and what any step showed: the words a model says before a tool («проверю
 * дату», «посмотрю, что открыто») are a step on the way — the chat shows them among the steps, a message would read
 * them as the answer.
 */
const shownParts = (parts: ChatMessage["parts"]) => {
  let lastStep = -1;
  for (const [i, p] of parts.entries()) {
    if (p.type === "step-start") {
      lastStep = i;
    }
  }
  return parts.filter((p, i) => p.type !== "text" || i > lastStep);
};

/**
 * An answer's parts as blocks for Telegram: what `letterBlocks` draws for a letter, and the cards and lists of open
 * promises the memory showed — as lines, since Telegram has no buttons for them.
 */
export const answerBlocks = (
  parts: ChatMessage["parts"],
  {
    locale,
    timeZone,
    words,
  }: { locale: Locale; timeZone: string; words: ShownWords }
): LetterBlock[] => {
  const day = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      timeZone,
    }).format(new Date(iso));
  return shownParts(parts).flatMap((p): LetterBlock[] => {
    if (p.type === "tool-show_promises" && p.state === "output-available") {
      const out = p.output;
      const items = out.records.map((r) =>
        promiseItem(r, out.today, words, day, timeZone)
      );
      return items.length === 0
        ? []
        : [
            ...(out.card
              ? [{ text: out.card.name, type: "heading" as const }]
              : []),
            {
              items:
                out.more > 0
                  ? [...items, { text: words.more(out.more) }]
                  : items,
              type: "list",
            },
          ];
    }
    if (p.type === "tool-show_card" && p.state === "output-available") {
      const out = p.output;
      if (!out.found) {
        return [];
      }
      const today = dayKeyIn(new Date(), timeZone);
      const items = out.open.map((r) =>
        promiseItem(r, today, words, day, timeZone)
      );
      return [
        {
          text: out.card.role
            ? `${out.card.name} — ${out.card.role}`
            : out.card.name,
          type: "heading",
        },
        ...(items.length > 0
          ? [
              {
                items:
                  out.moreOpen > 0
                    ? [...items, { text: words.more(out.moreOpen) }]
                    : items,
                type: "list" as const,
              },
            ]
          : []),
      ];
    }
    return letterBlocks([p], { locale, maxBlocks: 40 });
  });
};
