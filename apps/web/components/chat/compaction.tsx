"use client";

import type { ChatMessage, CompactionData } from "@metobe/contracts/chat";
import { Button } from "@metobe/ui/components/button";
import { Spinner } from "@metobe/ui/components/spinner";
import { cn } from "@metobe/ui/lib/utils";
import { FoldVertical } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Streamdown } from "streamdown";

import { compactChatAction } from "@/app/(app)/(chat)/actions";
import { useCompactBridge } from "@/components/chat/compact-bridge";
import { heavyAnswer } from "@/lib/compaction";

// «Сжать чат» in the thread (D37, prototype /dev/prototypes/compact, «Карточка»): the offer under a heavy answer —
// why, in numbers, and that answers get slower and cost more without it — the service model writing, and the summary
// the model goes on from, folded to a few lines. There is no «undo»: the summary is what the model knows from here.

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";
/** In, as a thing that came: 4 px up and a fade; reduced motion — the fade. */
const ENTER = `animate-in fade-in slide-in-from-bottom-1 duration-200 ${EASE} motion-reduce:slide-in-from-bottom-0`;

// «Не сейчас» hides the offer until the next heavy answer: the answer it was made for is kept, per chat, in this
// browser. Read only in the browser — the server's page shows no offer, so nothing changes on hydration.
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const keyOf = (chatId: string) => `metobe:compact-later:${chatId}`;
const read = (key: string) => {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
};
/** On the server: not known yet — no offer. */
const UNKNOWN = "\u0000";

/** The answer whose offer was put off in this chat ("" — none); `UNKNOWN` until the browser has read it. */
export const useOfferPutOff = (chatId: string) => {
  const key = keyOf(chatId);
  const putOff = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => UNKNOWN
  );
  const putOffNow = (answerId: string) => {
    try {
      localStorage.setItem(key, answerId);
    } catch {
      // Storage blocked: the offer just comes back on the next visit.
    }
    for (const listener of listeners) {
      listener();
    }
  };
  return { known: putOff !== UNKNOWN, putOff, putOffNow };
};

/** The offer, and — once asked — the service model at work, in the same place. */
export const CompactOffer = ({
  stepTokens,
  writing,
  error,
  onCompact,
  onLater,
}: {
  /** The heavy answer's weight a step; none when asked for from the menu (no offer, only the work and its end). */
  stepTokens?: number;
  writing: boolean;
  /** What went wrong the last time, said. */
  error?: string;
  onCompact: () => void;
  onLater: () => void;
}) => {
  const t = useTranslations("chat.compact");
  const format = useFormatter();
  if (writing) {
    return (
      <div
        aria-live="polite"
        className="flex flex-col gap-3 rounded-xl border p-4"
      >
        <span className="text-muted-foreground flex items-center gap-2 text-sm">
          <Spinner className="size-3.5" /> {t("writing")}
        </span>
        <div aria-hidden className="flex flex-col gap-2">
          {["w-11/12", "w-4/5", "w-2/3"].map((w) => (
            <span
              className={cn(
                "bg-muted h-2.5 animate-pulse rounded-full motion-reduce:animate-none",
                w
              )}
              key={w}
            />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className={cn("bg-muted/40 flex gap-3 rounded-xl border p-4", ENTER)}>
      <FoldVertical className="text-muted-foreground mt-0.5 size-4 shrink-0" />
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t("heavyTitle")}</span>
          {stepTokens !== undefined && (
            <span className="text-muted-foreground text-sm">
              {t("heavyText", {
                tokens: format.number(stepTokens, { notation: "compact" }),
              })}
            </span>
          )}
          {error && <span className="text-destructive text-sm">{error}</span>}
        </div>
        <div className="flex gap-2">
          <Button onClick={onCompact} size="sm">
            {t("compact")}
          </Button>
          <Button onClick={onLater} size="sm" variant="ghost">
            {t("later")}
          </Button>
        </div>
      </div>
    </div>
  );
};

/** The summary in the thread: folded to a few lines, opened on a click — what the model knows from here on. */
export const CompactionCard = ({ data }: { data: CompactionData }) => {
  const t = useTranslations("chat.compact");
  const [whole, setWhole] = useState(false);
  return (
    <div className={cn("flex flex-col gap-2 rounded-xl border p-4", ENTER)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <FoldVertical className="text-muted-foreground size-4" />
        <span className="text-sm font-medium">{t("summaryTitle")}</span>
        <span className="text-muted-foreground text-xs">
          · {t("summaryCount", { count: data.messages })}
        </span>
      </div>
      <div
        className={cn(
          // The summary's sections read as the card's own subheads, not page titles.
          "overflow-hidden text-sm leading-relaxed [&_h1]:mt-3 [&_h1]:mb-1 [&_h1]:text-sm [&_h1]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_li]:my-0.5 [&_p]:my-2 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&>*:first-child]:mt-0",
          !whole &&
            "max-h-32 [mask-image:linear-gradient(to_bottom,black_60%,transparent)]"
        )}
      >
        <Streamdown>{data.summary}</Streamdown>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">{t("kept")}</p>
        <Button
          aria-expanded={whole}
          className="text-muted-foreground"
          onClick={() => setWhole((w) => !w)}
          size="xs"
          variant="ghost"
        >
          {whole ? t("collapse") : t("showAll")}
        </Button>
      </div>
    </div>
  );
};

/**
 * The thread's compaction: whether to offer it (a heavy last answer, not put off), the service model at work, what
 * went wrong — and the header's «Сжать чат» registered to run here. The summary joins the thread when it comes.
 */
export const useCompaction = ({
  chatId,
  messages,
  busy,
  setMessages,
}: {
  chatId: string;
  messages: ChatMessage[];
  busy: boolean;
  setMessages: (update: (all: ChatMessage[]) => ChatMessage[]) => void;
}) => {
  const t = useTranslations("chat.compact");
  const heavy = heavyAnswer(messages);
  const { known, putOff, putOffNow } = useOfferPutOff(chatId);
  const offerFor = known && heavy && putOff !== heavy ? heavy : null;
  const [state, setState] = useState<{ writing: boolean; error?: string }>({
    writing: false,
  });
  const compact = async () => {
    if (busy || state.writing) {
      return;
    }
    setState({ writing: true });
    const result = await compactChatAction(chatId);
    if (result.ok) {
      setMessages((all) => [...all, result.message]);
      setState({ writing: false });
      return;
    }
    const said: Partial<Record<string, string>> = {
      busy: t("busy"),
      short: t("short"),
    };
    setState({ error: said[result.reason] ?? t("failed"), writing: false });
  };
  const bridge = useCompactBridge();
  // Re-registered after every render: the handler sees this render's messages and state.
  useEffect(() => {
    bridge?.register(() => {
      void compact();
    });
  });
  useEffect(() => () => bridge?.register(null), [bridge]);
  return {
    offer: {
      error: state.error,
      onCompact: () => {
        void compact();
      },
      onLater: () => {
        if (heavy) {
          putOffNow(heavy);
        }
        setState({ writing: false });
      },
      stepTokens: offerFor ? messages.at(-1)?.metadata?.stepTokens : undefined,
      writing: state.writing,
    },
    // Not while an answer is on its way: the offer is about the answer that has ended.
    shown: !busy && Boolean(offerFor || state.writing || state.error),
  };
};
