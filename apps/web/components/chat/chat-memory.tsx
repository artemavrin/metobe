"use client";

import type { ChatMemory, MemoryEntityKind } from "@metobe/contracts/memory";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@metobe/ui/components/popover";
import { IconTile } from "@metobe/ui/components/reui/icon-tile";
import { Toaster, toast } from "@metobe/ui/components/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import { BookUser, ChevronDown, Undo2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { use, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { ChatMemoryContext } from "./use-chat-memory";
import type { ChatMemoryApi, MemoryAnswer } from "./use-chat-memory";

// Under an answer (ARCH §19, P18): «Запомнено: …» with «Отменить», and the question the writer could not settle —
// on a light plate in the app's colour, a ring round it when it comes. If it comes off screen or while the person is
// in the composer, a toast asks too (ReUI c-sonner-9): the choices right in it, «Показать в чате», «Не запоминать».

type Question = ChatMemory["questions"][number];

const CSS = `
@keyframes memory-ring { 0% { box-shadow: 0 0 0 6px color-mix(in oklab, var(--primary) 22%, transparent); } 100% { box-shadow: 0 0 0 0 transparent; } }
.memory-ring { animation: memory-ring 1.6s cubic-bezier(0.23, 1, 0.32, 1); }
@media (prefers-reduced-motion: reduce) { .memory-ring { animation: none; } }
`;
const ENTER =
  "animate-in fade-in slide-in-from-bottom-1 motion-reduce:slide-in-from-bottom-0 fill-mode-both duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]";
const PRESS =
  "transition-[background-color,border-color,color,scale] duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100";
const TOAST_MS = 12_000;

/** The thread's hints: the sidebar's surface, no arrow. */
const Hint = ({
  children,
  hint,
}: {
  children: React.ReactElement;
  hint?: string | null;
}) =>
  hint ? (
    <Tooltip>
      <TooltipTrigger delay={400} render={children} />
      <TooltipContent
        arrow={false}
        className="bg-sidebar text-foreground ring-foreground/10 max-w-64 shadow-md ring-1"
        sideOffset={6}
      >
        {hint}
      </TooltipContent>
    </Tooltip>
  ) : (
    children
  );

const NEW_LABEL: Record<
  MemoryEntityKind,
  "newPerson" | "newOrg" | "newProject" | "newGroup" | "newOther"
> = {
  custom: "newOther",
  group: "newGroup",
  org: "newOrg",
  person: "newPerson",
  project: "newProject",
  self: "newPerson",
};

/** The choices of a question: its cards, then a new one of their kind (`fresh` — its words). */
const choicesOf = (
  q: Question,
  fresh: (key: (typeof NEW_LABEL)[MemoryEntityKind]) => string
) => [
  ...q.candidates.map((c) => ({
    answer: { entityId: c.id } as MemoryAnswer,
    hint: c.role,
    id: c.id,
    label: c.name,
  })),
  {
    answer: { newCard: true } as MemoryAnswer,
    hint: null,
    id: "new",
    label: fresh(NEW_LABEL[q.candidates[0]?.kind ?? "person"]),
  },
];

const Note = ({
  note,
  api,
}: {
  note: ChatMemory["notes"][number];
  api: ChatMemoryApi;
}) => {
  const t = useTranslations("chat.memory");
  const format = useFormatter();
  const many = note.records.length > 1;
  type Line = ChatMemory["notes"][number]["records"][number];
  const day = (iso: string | null) =>
    iso
      ? format.dateTime(new Date(iso), { day: "numeric", month: "short" })
      : t("noDue");
  // What the message put in, and what it took the place of: «… · заменило: «…»».
  const body = (r: Line) =>
    r.replaced ? t("replaced", { text: r.text, was: r.replaced }) : r.text;
  // A commitment the message settled reads as what became of it («Выполнено: Прислать договор»), one whose deadline it
  // moved as the move («Срок перенесён: … · 13 ноя → 16 ноя»).
  const line = (r: Line) => {
    if (r.status) {
      return t("settled", { status: r.status, text: r.text });
    }
    return r.due
      ? t("moved", { from: day(r.due.from), text: r.text, to: day(r.due.to) })
      : body(r);
  };
  const [first] = note.records;
  let summary = t("rememberedMany", { count: note.records.length });
  if (!many) {
    summary =
      first?.status || first?.due
        ? line(first)
        : t("remembered", { text: first ? body(first) : "" });
  }
  const summaryLine = (
    <>
      <BookUser className="size-3.5 shrink-0" />
      <span className="truncate">{summary}</span>
      {many && <ChevronDown className="size-3 shrink-0" />}
    </>
  );
  const look =
    "hover:text-foreground data-[popup-open]:text-foreground flex min-w-0 items-center gap-1.5 text-left transition-colors duration-150";
  // One line, in the answer's row of actions: the records of a note with several open over the thread, so nothing
  // under the answer changes height (the chat sits on its bottom).
  return (
    <div
      className={cn(
        "text-muted-foreground flex min-w-0 items-center gap-2 text-xs",
        ENTER
      )}
    >
      {many ? (
        <Popover>
          <PopoverTrigger
            render={
              <button aria-label={summary} className={look} type="button" />
            }
          >
            {summaryLine}
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="text-muted-foreground w-[min(28rem,calc(100vw-2rem))] p-3 text-xs"
            side="top"
          >
            <ul className="flex flex-col gap-1">
              {note.records.map((r) => (
                <li key={r.id}>{line(r)}</li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      ) : (
        <span className={cn(look, "hover:text-muted-foreground")}>
          {summaryLine}
        </span>
      )}
      <button
        className={cn(
          "hover:text-foreground flex shrink-0 items-center gap-1",
          PRESS
        )}
        onClick={() => api.undo(note.writeId)}
        type="button"
      >
        <Undo2 className="size-3" /> {t("undo")}
      </button>
    </div>
  );
};

/** The toast's body, ReUI's c-sonner-9: a tile, the title with the time, the question, the choices. */
const AskToast = ({
  question,
  onAnswer,
  onShow,
}: {
  question: Question;
  onAnswer: (answer: MemoryAnswer) => void;
  onShow: () => void;
}) => {
  const t = useTranslations("chat.memory");
  const choices = choicesOf(question, t);
  const roles = question.candidates.some((c) => c.role);
  const link =
    "text-muted-foreground hover:text-foreground transition-colors duration-150";
  return (
    <div className="bg-popover text-popover-foreground border-border flex w-[356px] max-w-[calc(100vw-32px)] items-start gap-3 rounded-md border p-4 shadow-lg">
      <IconTile size="sm" variant="soft">
        <BookUser />
      </IconTile>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">{t("question")}</p>
          <span className="text-muted-foreground text-xs">{t("now")}</span>
        </div>
        <p className="text-muted-foreground text-sm">{question.question}</p>
        <div
          className={cn(
            roles ? "-mx-2 mt-1.5 flex flex-col" : "mt-2 flex flex-wrap gap-2"
          )}
        >
          {choices.map((c) =>
            roles ? (
              <button
                className={cn(
                  "hover:bg-muted flex flex-col items-start rounded-md px-2 py-1.5 text-left",
                  PRESS
                )}
                key={c.id}
                onClick={() => onAnswer(c.answer)}
                type="button"
              >
                <span className="text-sm">{c.label}</span>
                {c.hint && (
                  <span className="text-muted-foreground text-xs">
                    {c.hint}
                  </span>
                )}
              </button>
            ) : (
              <button
                className={cn(
                  "bg-background hover:bg-muted h-6 rounded-md border px-2 text-xs",
                  PRESS
                )}
                key={c.id}
                onClick={() => onAnswer(c.answer)}
                type="button"
              >
                {c.label}
              </button>
            )
          )}
        </div>
        <div className="mt-1 flex gap-3 text-xs">
          <button className={link} onClick={onShow} type="button">
            {t("show")}
          </button>
          <button
            className={link}
            onClick={() => onAnswer({ dismiss: true })}
            type="button"
          >
            {t("skip")}
          </button>
        </div>
      </div>
    </div>
  );
};

const Ask = ({ question, api }: { question: Question; api: ChatMemoryApi }) => {
  const t = useTranslations("chat.memory");
  const plate = useRef<HTMLDivElement>(null);
  const fresh = api.fresh.has(question.id);
  // A new ring each time it is shown — when it comes, and when the toast leads to it.
  const [ring, setRing] = useState(fresh ? 1 : 0);
  const answer = (given: MemoryAnswer) => {
    void api.answer(question, given);
  };
  const showIt = () => {
    plate.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setRing((r) => r + 1);
  };
  // The toast lives outside this render: it calls the latest of these.
  const latest = useRef({ answer, showIt });
  useEffect(() => {
    latest.current = { answer, showIt };
  });

  // Came while the chat is open and is not seen — off screen, or behind the composer: the toast asks too. A plate in
  // view gets its ring only: a toast over it would say the same thing twice.
  useEffect(() => {
    const el = plate.current;
    if (!(fresh && el)) {
      return;
    }
    const timer = setTimeout(() => {
      const box = el.getBoundingClientRect();
      const inView = box.bottom > 0 && box.top < window.innerHeight;
      // The composer covers the bottom of the thread: a plate behind it is not seen either.
      const covered =
        (api.composer.current?.getBoundingClientRect().top ?? Infinity) <
        box.bottom;
      if (inView && !covered) {
        return;
      }
      toast.custom(
        (id) => (
          <AskToast
            onAnswer={(given) => {
              toast.dismiss(id);
              latest.current.answer(given);
            }}
            onShow={() => {
              toast.dismiss(id);
              latest.current.showIt();
            }}
            question={question}
          />
        ),
        { duration: TOAST_MS, id: question.id }
      );
    }, 400);
    return () => clearTimeout(timer);
  }, [fresh, question, api.composer]);

  return (
    <div className={ENTER} ref={plate}>
      <div
        className={cn(
          "bg-primary/[0.06] ring-primary/15 flex w-fit max-w-full flex-wrap items-center gap-x-1.5 gap-y-1.5 rounded-xl px-2.5 py-2 text-xs ring-1",
          ring > 0 && "memory-ring"
        )}
        key={ring}
      >
        <BookUser className="text-primary size-3.5 shrink-0" />
        <span className="text-foreground mr-0.5">{question.question}</span>
        {choicesOf(question, t).map((c) => (
          <Hint hint={c.hint} key={c.id}>
            <button
              className={cn(
                "bg-background text-foreground hover:border-primary/50 hover:text-primary border-primary/25 rounded-full border px-2.5 py-0.5",
                PRESS
              )}
              onClick={() => answer(c.answer)}
              type="button"
            >
              {c.label}
            </button>
          </Hint>
        ))}
        <button
          className="text-muted-foreground hover:text-foreground px-1 transition-colors duration-150"
          onClick={() => answer({ dismiss: true })}
          type="button"
        >
          {t("skip")}
        </button>
      </div>
    </div>
  );
};

/** What the memory took from the message this answer follows; nothing while the memory is off. */
export const MemoryUnder = ({
  messageId,
  part,
}: {
  messageId?: string;
  /** The note goes in the answer's row of actions; the questions stand under the answer as a block. */
  part: "note" | "questions";
}) => {
  const api = use(ChatMemoryContext);
  const memory = api?.memory;
  if (!(api && memory?.on && messageId)) {
    return null;
  }
  const note = memory.notes.find(
    (n) => n.messageId === messageId && !api.hidden.has(n.writeId)
  );
  const questions = memory.questions.filter(
    (q) => q.messageId === messageId && !api.hidden.has(q.id)
  );
  if (part === "note") {
    return note ? <Note api={api} note={note} /> : null;
  }
  if (questions.length === 0) {
    return null;
  }
  return (
    <div className="-mt-1 flex flex-col gap-2">
      <style>{CSS}</style>
      {questions.map((q) => (
        <Ask api={api} key={q.id} question={q} />
      ))}
    </div>
  );
};

/**
 * The chat's toasts, in the bottom right corner over the composer whatever its height (several lines, files): the
 * question's, «Удалено из памяти · Вернуть», «Не упустить». The composer stands 16 px off the bottom; the toast keeps
 * 12 px over it — on a narrow window the composer reaches the corner. On a phone sonner spreads it across the width.
 */
export const MemoryToaster = ({
  composer,
}: {
  composer: RefObject<HTMLDivElement | null>;
}) => {
  const [lift, setLift] = useState(96);
  useEffect(() => {
    const el = composer.current;
    if (!el) {
      return;
    }
    const observer = new ResizeObserver(() =>
      setLift(Math.round(el.getBoundingClientRect().height) + 28)
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [composer]);
  return (
    <Toaster
      mobileOffset={{ bottom: lift, left: 16, right: 16 }}
      offset={{ bottom: lift, right: 16 }}
      position="bottom-right"
    />
  );
};
