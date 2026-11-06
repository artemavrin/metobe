"use client";

import type { AskUserOutput } from "@metobe/contracts/chat";
import { Bubble, BubbleContent } from "@metobe/ui/components/bubble";
import { Button } from "@metobe/ui/components/button";
import { Checkbox } from "@metobe/ui/components/checkbox";
import { Kbd } from "@metobe/ui/components/kbd";
import { Message, MessageContent } from "@metobe/ui/components/message";
import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from "@metobe/ui/components/reui/stepper";
import { cn } from "@metobe/ui/lib/utils";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import type { AskUserPart, OpenAskPart } from "@/lib/ask-user";

// «Модель спрашивает» — Claude's AskUserQuestion for the web (prototype /dev/prototypes/ask-user). The questions take
// the composer's place: ReUI's stepper of their short headers on top (and «Отправить» as its last step when there are
// several), the question, numbered choices with a line of what each means, and a written answer always last — the
// interface adds it, the model does not. Picking one moves on by itself; several to pick — mark, then «Далее». The
// keys are Claude's: ↑↓ and digits, Enter, Tab between questions, Esc — not now, the model goes on by itself.

const ENTER =
  "animate-in fade-in slide-in-from-bottom-1 motion-reduce:slide-in-from-bottom-0 fill-mode-both duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]";

type Said = Record<string, string[]>;

/** Tab and ←→ move between the questions: by how much; 0 for any other key. ←→ stay the field's while typing. */
const stepBy = (e: KeyboardEvent, typing: boolean) => {
  if (e.key === "Tab") {
    return e.shiftKey ? -1 : 1;
  }
  if (typing) {
    return 0;
  }
  if (e.key === "ArrowRight") {
    return 1;
  }
  return e.key === "ArrowLeft" ? -1 : 0;
};

/** ↑↓ move the highlight: by how much; 0 for any other key. */
const moveBy = (e: KeyboardEvent) => {
  if (e.key === "ArrowDown") {
    return 1;
  }
  return e.key === "ArrowUp" ? -1 : 0;
};

/** A digit picks the row of its number: its index, or null. */
const rowOf = (e: KeyboardEvent, rows: number) =>
  /^[1-9]$/u.test(e.key) && Number(e.key) <= rows ? Number(e.key) - 1 : null;

export const AskPanel = ({
  part,
  onAnswer,
}: {
  part: OpenAskPart;
  onAnswer: (output: AskUserOutput) => void;
}) => {
  const t = useTranslations("chat.ask");
  const { questions } = part.input;
  const many = questions.length > 1;
  /** The open question; `questions.length` — the review before sending. */
  const [tab, setTab] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [picked, setPicked] = useState<Said>({});
  const [own, setOwn] = useState<Record<string, string>>({});
  const panel = useRef<HTMLElement>(null);
  const ownField = useRef<HTMLInputElement>(null);
  const q = questions[tab];
  const rows = q ? q.options.length + 1 : 0;
  const onOwn = q !== undefined && cursor === q.options.length;

  // The panel is where the composer was: the keys go to it at once.
  useEffect(() => panel.current?.focus(), []);
  useEffect(() => {
    if (onOwn) {
      ownField.current?.focus();
    }
  }, [onOwn]);

  const saidOf = (p: Said, o: Record<string, string>): Said =>
    Object.fromEntries(
      questions.map((x) => {
        const mine = o[x.question]?.trim();
        return [
          x.question,
          [...(p[x.question] ?? []), ...(mine ? [mine] : [])],
        ];
      })
    );
  const send = (p: Said, o: Record<string, string>) =>
    onAnswer({ answers: saidOf(p, o), skipped: false });
  const skip = () => onAnswer({ answers: {}, skipped: true });

  const go = (to: number) => {
    setTab(Math.max(0, Math.min(to, questions.length)));
    setCursor(0);
    panel.current?.focus();
  };
  const next = (p: Said, o: Record<string, string>) => {
    if (many) {
      go(tab + 1);
    } else {
      send(p, o);
    }
  };

  const choose = (i: number) => {
    if (!q) {
      return;
    }
    const option = q.options[i];
    if (!option) {
      setCursor(i);
      ownField.current?.focus();
      return;
    }
    if (q.multiSelect) {
      // Keys come faster than renders: toggle against the latest marks, not this render's.
      setPicked((prev) => {
        const mine = prev[q.question] ?? [];
        return {
          ...prev,
          [q.question]: mine.includes(option.label)
            ? mine.filter((x) => x !== option.label)
            : [...mine, option.label],
        };
      });
      setCursor(i);
      return;
    }
    const p = { ...picked, [q.question]: [option.label] };
    const o = { ...own, [q.question]: "" };
    setPicked(p);
    setOwn(o);
    next(p, o);
  };

  const sendOwn = () => {
    if (!q?.question || !own[q.question]?.trim()) {
      return;
    }
    const p = q.multiSelect ? picked : { ...picked, [q.question]: [] };
    setPicked(p);
    next(p, own);
  };

  /** A key the panel answers to; false — not its, let it go on. */
  const act = (e: KeyboardEvent) => {
    const typing = e.target === ownField.current;
    if (e.key === "Escape") {
      skip();
      return true;
    }
    const step = many ? stepBy(e, typing) : 0;
    if (step !== 0) {
      go(tab + step);
      return true;
    }
    const move = q ? moveBy(e) : 0;
    if (move !== 0) {
      setCursor((c) => (c + move + rows) % rows);
      if (typing) {
        panel.current?.focus();
      }
      return true;
    }
    if (typing) {
      return false;
    }
    if (e.key === "Enter") {
      if (q) {
        choose(cursor);
      } else {
        send(picked, own);
      }
      return true;
    }
    const row = q ? rowOf(e, rows) : null;
    if (row !== null) {
      choose(row);
      return true;
    }
    return false;
  };
  // The keys are the panel's, wherever the focus is inside it; the latest `act` always, without re-adding.
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (act(e)) {
      e.preventDefault();
      e.stopPropagation();
    }
  });
  useEffect(() => {
    const node = panel.current;
    node?.addEventListener("keydown", onKey);
    return () => node?.removeEventListener("keydown", onKey);
  }, []);

  const answered = (question: string) =>
    (saidOf(picked, own)[question]?.length ?? 0) > 0;
  const steps = [
    ...questions.map((x) => ({
      done: answered(x.question),
      key: x.question,
      title: x.header,
    })),
    { done: false, key: "\u0000send", title: t("send") },
  ];

  return (
    <section
      aria-label={t("label")}
      className={cn(
        "bg-background flex flex-col gap-3 rounded-3xl border p-3 shadow-sm outline-none sm:p-4",
        ENTER
      )}
      ref={panel}
      tabIndex={-1}
    >
      {many && (
        <Stepper
          className="w-fit px-1"
          onValueChange={(v) => go(v - 1)}
          value={tab + 1}
        >
          <StepperNav className="gap-2 data-[orientation=horizontal]:w-auto">
            {steps.map((s, i) => (
              <StepperItem
                className="not-last:flex-none"
                completed={s.done}
                key={s.key}
                step={i + 1}
              >
                <StepperTrigger className="gap-1.5" tabIndex={-1}>
                  <StepperIndicator className="data-[state=completed]:bg-primary/15 data-[state=completed]:text-primary dark:data-[state=completed]:text-foreground size-5 text-[11px]">
                    {s.done ? (
                      <Check
                        aria-label={t("answered")}
                        className="size-3"
                        strokeWidth={3}
                      />
                    ) : (
                      i + 1
                    )}
                  </StepperIndicator>
                  <StepperTitle className="text-muted-foreground group-data-[state=active]/step:text-foreground text-xs font-normal">
                    {s.title}
                  </StepperTitle>
                </StepperTrigger>
                {i < steps.length - 1 && (
                  <StepperSeparator className="group-data-[state=completed]/step:bg-primary/30 ms-2 group-data-[orientation=horizontal]/stepper-nav:w-5 group-data-[orientation=horizontal]/stepper-nav:flex-none" />
                )}
              </StepperItem>
            ))}
          </StepperNav>
        </Stepper>
      )}

      {q ? (
        <div className="flex flex-col gap-2" key={q.question}>
          <p className="px-1 font-medium">
            {q.question}
            {q.multiSelect && (
              <span className="text-muted-foreground font-normal">
                {" "}
                {t("several")}
              </span>
            )}
          </p>
          <div
            aria-label={q.question}
            aria-multiselectable={q.multiSelect || undefined}
            className="flex flex-col"
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- numbered rows with a line each and a field last; a <select> cannot
            role="listbox"
          >
            {q.options.map((o, i) => {
              const on = (picked[q.question] ?? []).includes(o.label);
              return (
                <button
                  aria-selected={on}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl px-2 py-2 text-start transition-colors duration-100",
                    cursor === i && "bg-muted"
                  )}
                  key={o.label}
                  onClick={() => choose(i)}
                  onPointerMove={() => {
                    if (cursor !== i) {
                      setCursor(i);
                    }
                  }}
                  // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an option of the listbox above, with a number and a line
                  role="option"
                  tabIndex={-1}
                  type="button"
                >
                  <Kbd className="mt-px">{i + 1}</Kbd>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm">{o.label}</span>
                    {o.description && (
                      <span className="text-muted-foreground text-sm">
                        {o.description}
                      </span>
                    )}
                  </span>
                  {q.multiSelect ? (
                    <Checkbox
                      aria-hidden
                      checked={on}
                      className="pointer-events-none mt-0.5"
                      tabIndex={-1}
                    />
                  ) : (
                    on && (
                      <Check className="text-primary mt-0.5 size-4 shrink-0" />
                    )
                  )}
                </button>
              );
            })}
            <form
              className={cn(
                "flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors duration-100",
                onOwn && "bg-muted"
              )}
              onSubmit={(e) => {
                // A form, so Enter — and the phone keyboard's «Далее» — sends the written answer on its own.
                e.preventDefault();
                sendOwn();
              }}
            >
              <Kbd>{q.options.length + 1}</Kbd>
              <input
                aria-label={t("own")}
                className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent py-0.5 text-sm outline-none"
                enterKeyHint={
                  many && tab < questions.length - 1 ? "next" : "send"
                }
                onChange={(e) =>
                  setOwn({ ...own, [q.question]: e.target.value })
                }
                onFocus={() => setCursor(q.options.length)}
                placeholder={t("own")}
                ref={ownField}
                value={own[q.question] ?? ""}
              />
            </form>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 px-1">
          <p className="font-medium">{t("review")}</p>
          <dl className="flex flex-col gap-1 text-sm">
            {questions.map((x) => {
              const words = saidOf(picked, own)[x.question] ?? [];
              return (
                <div className="flex min-w-0 gap-2" key={x.question}>
                  <dt className="text-muted-foreground shrink-0">
                    {x.question}
                  </dt>
                  <dd
                    className={cn(
                      "truncate",
                      words.length === 0 && "text-muted-foreground"
                    )}
                  >
                    {words.join(", ") || t("noAnswer")}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      )}

      <div className="flex items-center gap-3">
        <p className="text-muted-foreground hidden flex-1 gap-3 px-1 text-xs sm:flex">
          {q && <span>{t("keys.pick")}</span>}
          <span>{q ? t("keys.answer") : t("keys.send")}</span>
          {many && <span>{t("keys.next")}</span>}
          <span>{t("keys.skip")}</span>
        </p>
        <span className="flex-1 sm:hidden" />
        <Button
          className="text-muted-foreground sm:hidden"
          onClick={skip}
          size="sm"
          type="button"
          variant="ghost"
        >
          {t("skip")}
        </Button>
        {q?.multiSelect && (
          <Button
            disabled={!answered(q.question)}
            onClick={() => next(picked, own)}
            size="sm"
            type="button"
          >
            {many ? t("next") : t("answer")}
          </Button>
        )}
        {!q && (
          <Button onClick={() => send(picked, own)} size="sm" type="button">
            {t("send")}
          </Button>
        )}
      </div>
    </section>
  );
};

/**
 * What the user said to the model's questions, as their own message in the thread — `UserMessage`'s bubble, on the
 * right. Each answer under its question in small grey; a question left unanswered is not shown.
 */
export const AskedAnswer = ({ part }: { part: AskUserPart }) => {
  const t = useTranslations("chat.ask");
  if (part.state !== "output-available") {
    return null;
  }
  const said = part.input.questions.filter(
    (q) => (part.output.answers[q.question] ?? []).length > 0
  );
  return (
    <Message align="end" className={ENTER}>
      <MessageContent className="gap-1">
        <Bubble align="end" variant="muted">
          <BubbleContent className="flex flex-col gap-2 rounded-2xl rounded-br-md px-4 py-2.5">
            {part.output.skipped || said.length === 0 ? (
              <span>{t("skipped")}</span>
            ) : (
              said.map((q) => (
                <span className="flex flex-col" key={q.question}>
                  <span className="text-muted-foreground text-xs">
                    {q.question}
                  </span>
                  <span>
                    {(part.output.answers[q.question] ?? []).join(", ")}
                  </span>
                </span>
              ))
            )}
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  );
};
