"use client";

import { Button } from "@metobe/ui/components/button";
import { Checkbox } from "@metobe/ui/components/checkbox";
import { Kbd } from "@metobe/ui/components/kbd";
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
import { useEffect, useRef, useState } from "react";

import { ChatFrame } from "./chat";
import type { Answers } from "./data";
import { AnswerMessage, ENTER } from "./parts";
import { useAsk } from "./state";

// «Как у Claude» — Claude Code's AskUserQuestion, for the web. The questions take the composer's place: the chips of
// their short headers on top as ReUI's stepper (and «Отправить» as its last step when there are several), the question, numbered choices with
// a line of what each means, and «Свой вариант» always last — the interface adds it, the model does not. Picking one
// moves on by itself; several to pick — mark, then «Далее». The keys are Claude's: ↑↓ and digits, Enter, Tab between
// questions, Esc — not now, the model goes on by itself. Answered, it is the user's message in the thread.

export const Claude = () => {
  const a = useAsk();
  return (
    <ChatFrame
      ask={a}
      dock={a.phase === "asking" ? <Panel a={a} /> : undefined}
      reply={a.phase === "asking" ? undefined : <AnswerMessage a={a} />}
    />
  );
};

const Panel = ({ a }: { a: ReturnType<typeof useAsk> }) => {
  const { questions } = a.scenario;
  const many = questions.length > 1;
  /** The open question; `questions.length` — the review before sending. */
  const [tab, setTab] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [picked, setPicked] = useState<Answers>({});
  const [own, setOwn] = useState<Record<string, string>>({});
  const panel = useRef<HTMLDivElement>(null);
  const ownField = useRef<HTMLInputElement>(null);
  const q = questions[tab];
  const rows = q ? q.choices.length + 1 : 0;
  const onOwn = q !== undefined && cursor === q.choices.length;

  // The panel is where the composer was: the keys go to it at once.
  useEffect(() => panel.current?.focus(), []);
  useEffect(() => {
    if (onOwn) ownField.current?.focus();
  }, [onOwn]);

  const answersOf = (p: Answers, o: Record<string, string>): Answers =>
    Object.fromEntries(questions.map((x) => [x.name, [...(p[x.name] ?? []), ...(o[x.name]?.trim() ? [o[x.name]!.trim()] : [])]]));

  const go = (t: number) => {
    setTab(Math.max(0, Math.min(t, questions.length)));
    setCursor(0);
    panel.current?.focus();
  };
  const next = (p: Answers, o: Record<string, string>) => {
    if (many) go(tab + 1);
    else a.answer(answersOf(p, o));
  };

  const choose = (i: number) => {
    if (!q) return;
    const choice = q.choices[i];
    if (!choice) {
      setCursor(i);
      ownField.current?.focus();
      return;
    }
    if (q.multiple) {
      // Keys come faster than renders: toggle against the latest marks, not this render's.
      setPicked((prev) => {
        const mine = prev[q.name] ?? [];
        return { ...prev, [q.name]: mine.includes(choice.label) ? mine.filter((x) => x !== choice.label) : [...mine, choice.label] };
      });
      setCursor(i);
      return;
    }
    const p = { ...picked, [q.name]: [choice.label] };
    const o = { ...own, [q.name]: "" };
    setPicked(p);
    setOwn(o);
    next(p, o);
  };

  const sendOwn = () => {
    if (!q || !own[q.name]?.trim()) return;
    const p = q.multiple ? picked : { ...picked, [q.name]: [] };
    setPicked(p);
    next(p, own);
  };

  // Handled keys stop here: the prototype's picker also listens on `document` (digits switch its variants).
  const onKey = (e: React.KeyboardEvent) => {
    const typing = e.target === ownField.current;
    if (e.key === "Escape") {
      e.preventDefault();
      e.nativeEvent.stopImmediatePropagation();
      a.skip();
    } else if (many && e.key === "Tab") {
      e.preventDefault();
      e.nativeEvent.stopImmediatePropagation();
      go(tab + (e.shiftKey ? -1 : 1));
    } else if (many && !typing && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      e.preventDefault();
      e.nativeEvent.stopImmediatePropagation();
      go(tab + (e.key === "ArrowRight" ? 1 : -1));
    } else if (q && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      e.nativeEvent.stopImmediatePropagation();
      setCursor((c) => (c + (e.key === "ArrowDown" ? 1 : rows - 1)) % rows);
      if (typing) panel.current?.focus();
    } else if (e.key === "Enter" && !typing) {
      e.preventDefault();
      e.nativeEvent.stopImmediatePropagation();
      if (!q) a.answer(answersOf(picked, own));
      else choose(cursor);
    } else if (!typing && q && /^[1-9]$/.test(e.key) && Number(e.key) <= rows) {
      e.preventDefault();
      e.nativeEvent.stopImmediatePropagation();
      choose(Number(e.key) - 1);
    }
  };

  const answered = (name: string) => (answersOf(picked, own)[name]?.length ?? 0) > 0;

  return (
    <div
      aria-label="Вопрос модели"
      className={cn("bg-background flex flex-col gap-3 rounded-3xl border p-3 shadow-sm outline-none sm:p-4", ENTER)}
      onKeyDown={onKey}
      ref={panel}
      role="group"
      tabIndex={-1}
    >
      {many && (
        <Stepper className="w-fit px-1" onValueChange={(v) => go(v - 1)} value={tab + 1}>
          <StepperNav className="gap-2 data-[orientation=horizontal]:w-auto">
            {[...questions.map((x) => ({ done: answered(x.name), name: x.name, title: x.header })), { done: false, name: "send", title: "Отправить" }].map(
              (s, i, all) => (
                <StepperItem className="not-last:flex-none" completed={s.done} key={s.name} step={i + 1}>
                  <StepperTrigger className="gap-1.5" tabIndex={-1}>
                    <StepperIndicator className="size-5 text-[11px] data-[state=completed]:bg-primary/15 data-[state=completed]:text-primary dark:data-[state=completed]:text-foreground">
                      {s.done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                    </StepperIndicator>
                    <StepperTitle className="text-muted-foreground group-data-[state=active]/step:text-foreground text-xs font-normal">{s.title}</StepperTitle>
                  </StepperTrigger>
                  {i < all.length - 1 && <StepperSeparator className="ms-2 group-data-[orientation=horizontal]/stepper-nav:w-5 group-data-[orientation=horizontal]/stepper-nav:flex-none group-data-[state=completed]/step:bg-primary/30" />}
                </StepperItem>
              )
            )}
          </StepperNav>
        </Stepper>
      )}

      {q ? (
        <div className="flex flex-col gap-2" key={q.name}>
          <p className="px-1 font-medium">
            {q.prompt}
            {q.multiple && <span className="text-muted-foreground font-normal"> Можно несколько.</span>}
          </p>
          <div aria-label={q.prompt} className="flex flex-col" role="listbox" aria-multiselectable={q.multiple || undefined}>
            {q.choices.map((c, i) => {
              const on = (picked[q.name] ?? []).includes(c.label);
              return (
                <div
                  aria-selected={on}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl px-2 py-2 transition-colors duration-100",
                    cursor === i && "bg-muted"
                  )}
                  key={c.value}
                  onClick={() => choose(i)}
                  onMouseMove={() => cursor !== i && setCursor(i)}
                  role="option"
                >
                  <Kbd className="mt-px">{i + 1}</Kbd>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm">{c.label}</span>
                    {c.description && <span className="text-muted-foreground text-sm">{c.description}</span>}
                  </span>
                  {q.multiple ? (
                    <Checkbox aria-hidden checked={on} className="pointer-events-none mt-0.5" tabIndex={-1} />
                  ) : (
                    on && <Check className="text-primary mt-0.5 size-4 shrink-0" />
                  )}
                </div>
              );
            })}
            <form
              className={cn("flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors duration-100", onOwn && "bg-muted")}
              onMouseMove={() => !onOwn && setCursor(q.choices.length)}
              onSubmit={(e) => {
                // A form, so Enter — and the phone keyboard's «Далее» — sends the written answer on its own.
                e.preventDefault();
                sendOwn();
              }}
            >
              <Kbd>{q.choices.length + 1}</Kbd>
              <input
                aria-label={q.other ?? "Свой вариант"}
                className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent py-0.5 text-sm outline-none"
                onChange={(e) => setOwn({ ...own, [q.name]: e.target.value })}
                enterKeyHint={many && tab < questions.length - 1 ? "next" : "send"}
                onFocus={() => setCursor(q.choices.length)}
                placeholder={q.other ?? "Свой вариант…"}
                ref={ownField}
                value={own[q.name] ?? ""}
              />
            </form>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 px-1">
          <p className="font-medium">Проверьте ответы</p>
          <dl className="flex flex-col gap-1 text-sm">
            {questions.map((x) => {
              const words = answersOf(picked, own)[x.name] ?? [];
              return (
                <div className="flex min-w-0 gap-2" key={x.name}>
                  <dt className="text-muted-foreground shrink-0">{x.prompt}</dt>
                  <dd className={cn("truncate", words.length === 0 && "text-muted-foreground")}>{words.join(", ") || "без ответа"}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      )}

      <div className="flex items-center gap-3">
        <p className="text-muted-foreground hidden flex-1 gap-3 px-1 text-xs sm:flex">
          {q && <span>↑↓ выбрать</span>}
          <span>Enter — {q ? "ответить" : "отправить"}</span>
          {many && <span>Tab — следующий вопрос</span>}
          <span>Esc — пропустить</span>
        </p>
        <span className="flex-1 sm:hidden" />
        <Button className="text-muted-foreground sm:hidden" onClick={a.skip} size="sm" type="button" variant="ghost">
          Пропустить
        </Button>
        {q?.multiple && (
          <Button disabled={!answered(q.name)} onClick={() => next(picked, own)} size="sm" type="button">
            {many ? "Далее" : "Ответить"}
          </Button>
        )}
        {!q && (
          <Button onClick={() => a.answer(answersOf(picked, own))} size="sm" type="button">
            Отправить
          </Button>
        )}
      </div>
    </div>
  );
};
