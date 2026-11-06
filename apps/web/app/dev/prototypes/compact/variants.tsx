"use client";

import { Button } from "@metobe/ui/components/button";
import { Spinner } from "@metobe/ui/components/spinner";
import { cn } from "@metobe/ui/lib/utils";
import { ChevronDown, FoldVertical, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { HISTORY, WEIGHT } from "./data";
import { ChatFrame, EASE, ENTER, Summary } from "./frame";
import { useProto } from "./state";

// Three ways to offer the compaction and to show it once done (D37). Each: the hint while the chat is heavy, the
// service model writing («сжимаем…»), the summary in the thread, and «Вернуть как было».
//
// «Строка» — the quietest: the hint is the composer's foot line, the compaction a hairline in the thread with the
// summary folded under a pill. «Карточка» — the hint comes as a card under the heavy answer, says why in numbers, and
// the summary stays a card of its own. «Свёртка» — the hint is a chip over the composer; the history before the
// compaction folds away behind its summary, and opens again on a click.

const k = (n: number) => `${Math.round(n / 1000)} тыс.`;

/** Opens to its height: grid rows 0fr → 1fr, the sanctioned accordion (no transform can do it). */
const Reveal = ({ open, children }: { open: boolean; children: ReactNode }) => (
  <div
    className={cn(
      "grid transition-[grid-template-rows,opacity] duration-250 motion-reduce:transition-none",
      EASE,
      open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
    )}
  >
    <div className="min-h-0 overflow-hidden">{children}</div>
  </div>
);

const Undo = () => {
  const { undo } = useProto();
  return (
    <Button className="text-muted-foreground" onClick={undo} size="xs" variant="ghost">
      <RotateCcw /> Вернуть как было
    </Button>
  );
};

const Kept = () => (
  <p className="text-muted-foreground text-xs">
    Дальше модель работает с этим итогом: {k(WEIGHT.tokensBefore)} токенов истории стали {k(WEIGHT.tokensAfter)}. Весь чат остаётся у вас.
  </p>
);

// ——— «Строка» ———

export const Line = () => {
  const { phase, dismissed, compact } = useProto();
  const [open, setOpen] = useState(false);
  const heavy = phase === "heavy" && !dismissed;
  return (
    <ChatFrame
      foot={
        heavy ? (
          <span className={cn("flex items-center gap-1.5", ENTER)}>
            <FoldVertical className="size-3.5" />
            Длинный чат: модель отвечает медленнее и хуже помнит начало ·
            <button className="text-foreground font-medium underline-offset-2 hover:underline" onClick={compact} type="button">
              Сжать чат
            </button>
          </span>
        ) : phase === "compacting" ? (
          <span className="flex items-center gap-1.5">
            <Spinner className="size-3" /> Служебная модель пишет итог разговора…
          </span>
        ) : undefined
      }
      inThread={
        phase === "heavy" ? undefined : (
          <div className={cn("flex flex-col gap-3", ENTER)}>
            <div className="flex items-center gap-3">
              <span className="bg-border h-px flex-1" />
              {phase === "compacting" ? (
                <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <Spinner className="size-3" /> Сжимаю чат…
                </span>
              ) : (
                <button
                  aria-expanded={open}
                  className="text-muted-foreground hover:text-foreground hover:bg-muted flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors duration-150"
                  onClick={() => setOpen((o) => !o)}
                  type="button"
                >
                  <FoldVertical className="size-3.5" /> Чат сжат · итог
                  <ChevronDown className={cn("size-3.5 transition-transform duration-200", EASE, open && "rotate-180")} />
                </button>
              )}
              <span className="bg-border h-px flex-1" />
            </div>
            <Reveal open={phase === "compacted" && open}>
              <div className="bg-muted/40 flex flex-col gap-2 rounded-xl p-4">
                <Summary />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Kept />
                  <Undo />
                </div>
              </div>
            </Reveal>
          </div>
        )
      }
    />
  );
};

// ——— «Карточка» ———

export const Card = () => {
  const { phase, dismissed, dismiss, compact } = useProto();
  const [whole, setWhole] = useState(false);
  let card: ReactNode = null;
  if (phase === "heavy" && !dismissed) {
    card = (
      <div className={cn("bg-muted/40 flex gap-3 rounded-xl border p-4", ENTER)}>
        <FoldVertical className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Чат стал длинным</span>
            <span className="text-muted-foreground text-sm">
              Последний ответ отправлял модели около {k(WEIGHT.stepTokens)} токенов на каждый шаг: она отвечает медленнее и хуже помнит начало.
              Служебная модель сожмёт разговор в итог — весь чат останется у вас.
            </span>
          </div>
          <div className="flex gap-2">
            <Button onClick={compact} size="sm">
              Сжать чат
            </Button>
            <Button onClick={dismiss} size="sm" variant="ghost">
              Не сейчас
            </Button>
          </div>
        </div>
      </div>
    );
  }
  if (phase === "compacting") {
    card = (
      <div className="flex flex-col gap-3 rounded-xl border p-4">
        <span className="text-muted-foreground flex items-center gap-2 text-sm">
          <Spinner className="size-3.5" /> Пишу итог разговора…
        </span>
        <div aria-hidden className="flex flex-col gap-2">
          {["w-11/12", "w-4/5", "w-2/3"].map((w) => (
            <span className={cn("bg-muted h-2.5 animate-pulse rounded-full motion-reduce:animate-none", w)} key={w} />
          ))}
        </div>
      </div>
    );
  }
  if (phase === "compacted") {
    card = (
      <div className={cn("flex flex-col gap-2 rounded-xl border p-4", ENTER)}>
        <div className="flex items-center gap-2">
          <FoldVertical className="text-muted-foreground size-4" />
          <span className="text-sm font-medium">Итог разговора</span>
          <span className="text-muted-foreground text-xs">· сжато {HISTORY.length} сообщений</span>
          <span className="ml-auto">
            <Undo />
          </span>
        </div>
        <div className={cn("relative overflow-hidden", !whole && "max-h-32 [mask-image:linear-gradient(to_bottom,black_60%,transparent)]")}>
          <Summary />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Kept />
          <Button className="text-muted-foreground" onClick={() => setWhole((w) => !w)} size="xs" variant="ghost">
            {whole ? "Свернуть" : "Показать целиком"}
          </Button>
        </div>
      </div>
    );
  }
  return <ChatFrame inThread={card} />;
};

// ——— «Свёртка» ———

export const Fold = () => {
  const { phase, dismissed, dismiss, compact } = useProto();
  const [open, setOpen] = useState(false);
  const heavy = phase === "heavy" && !dismissed;
  return (
    <ChatFrame
      above={
        heavy || phase === "compacting" ? (
          <div className={cn("flex", ENTER)}>
            <span className="bg-muted/60 flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-3 text-xs">
              {phase === "compacting" ? (
                <span className="text-muted-foreground flex items-center gap-1.5 py-1 pr-2">
                  <Spinner className="size-3" /> Сжимаю чат…
                </span>
              ) : (
                <>
                  <button className="flex items-center gap-1.5 py-1 font-medium" onClick={compact} type="button">
                    <FoldVertical className="size-3.5" /> Сжать чат — ответы станут быстрее
                  </button>
                  <Button aria-label="Не сейчас" className="size-6 rounded-full" onClick={dismiss} size="icon-xs" variant="ghost">
                    <X />
                  </Button>
                </>
              )}
            </span>
          </div>
        ) : undefined
      }
      fold={(history) =>
        phase === "compacted" ? (
          <div className={cn("flex flex-col gap-3", ENTER)}>
            <button
              aria-expanded={open}
              className="text-muted-foreground hover:text-foreground flex items-center gap-2 self-start text-xs transition-colors duration-150"
              onClick={() => setOpen((o) => !o)}
              type="button"
            >
              <ChevronDown className={cn("size-3.5 -rotate-90 transition-transform duration-200", EASE, open && "rotate-0")} />
              {HISTORY.length} сообщений сжаты в итог — {open ? "свернуть" : "показать"}
            </button>
            <Reveal open={open}>
              <div className="border-l-2 py-1 pl-4 opacity-80">{history}</div>
            </Reveal>
            <div className="bg-muted/40 flex flex-col gap-2 rounded-xl p-4">
              <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Итог разговора</span>
              <Summary />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Kept />
                <Undo />
              </div>
            </div>
          </div>
        ) : (
          <div className={cn("transition-opacity duration-300", phase === "compacting" && "opacity-50")}>{history}</div>
        )
      }
    />
  );
};
