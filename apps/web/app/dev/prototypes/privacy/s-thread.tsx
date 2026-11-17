"use client";

import { Button } from "@metobe/ui/components/button";
import { Tooltip, TooltipTrigger } from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import { Brain, ChevronRight, Copy, FileSpreadsheet, Pencil, RefreshCw, Server, ThumbsDown, ThumbsUp, Wrench } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { useProto } from "../memory/frame";
import {
  ASK,
  ATTACHMENT,
  CLOUD,
  LOCAL,
  PLAIN_ANSWER,
  PLAIN_ASK,
  RAW_ANSWER,
  TOOL_INPUT,
  TOOL_OUTPUT,
  mask,
  uniqueHidden,
  unmaskAnswer,
} from "./data";
import { ChatShell, usePhone } from "./frame";
import { Expand, LENS_CSS, Mark, Seen } from "./lens";
import { RestoringStatus } from "./model-view";
import { AttachmentLine, EASE, Tip, useStream } from "./parts";
import { ComposerStub } from "./s-answer";

// Сцена «Лента» (З5, вторая редакция). Панели «Что увидела модель» нет: у каждого сообщения свой значок — щит
// с числом скрытого — в строке действий под сообщением, как «копировать». У сообщения человека он показывает, что ушло
// в модель; у шага — что модель отправила в тул и что получила; у ответа — что модель написала до восстановления.
// Где ничего не скрыто, значка нет. Спорное — как показывать:
//   1 «На месте» — сам текст сообщения меняется на то, что было у модели; второе нажатие возвращает;
//   2 «Рядом» — под сообщением раскрывается версия модели, сообщение остаётся как было.
// Ручки: `mark=hover|always` (значок при наведении или всегда), `st=done|stream`, `src=cloud|local`, `att=no|yes`,
// `open=1` — все значки нажаты.

type Mode = "flip" | "beside";

const ASK_PIECES = mask(ASK).pieces;
const ANSWER_PIECES = unmaskAnswer(RAW_ANSWER);
const json = (v: unknown) => JSON.stringify(v, null, 2);
const INPUT_PIECES = mask(json(TOOL_INPUT)).pieces;
const OUTPUT_PIECES = mask(json(TOOL_OUTPUT)).pieces;

const COUNT = {
  answer: uniqueHidden(ANSWER_PIECES).length,
  ask: uniqueHidden(ASK_PIECES).length,
  tool: uniqueHidden([...INPUT_PIECES, ...OUTPUT_PIECES]).length,
};

/** Строка под сообщением — как в чате: видна, пока указатель на сообщении; на сенсорном экране — всегда. */
const HOVER =
  "opacity-0 transition-opacity duration-150 group-hover/message:opacity-100 group-focus-within/message:opacity-100 [@media(hover:none)]:opacity-100";

const Action = ({ label, children }: { label: string; children: ReactNode }) => (
  <Tooltip>
    <TooltipTrigger
      delay={500}
      render={
        <Button aria-label={label} className="text-muted-foreground hover:text-foreground [&_svg]:size-3.5" size="icon-xs" variant="ghost" />
      }
    >
      {children}
    </TooltipTrigger>
    <Tip>{label}</Tip>
  </Tooltip>
);

/** Подпись версии модели в «Рядом». */
const Caption = ({ children }: { children: ReactNode }) => <span className="text-muted-foreground text-xs">{children}</span>;

interface View {
  mode: Mode;
  /** Значок виден всегда, а не только при наведении. */
  always: boolean;
  local: boolean;
}

/** Сообщение человека. */
const Asked = ({ view, lens, onLens, att }: { view: View; lens: boolean; onLens: () => void; att: boolean }) => {
  const marked = !view.local;
  const flip = view.mode === "flip" && lens;
  return (
    <div className="group/message flex flex-col items-end gap-1">
      {att && (
        <span className="bg-muted/60 flex w-fit items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs">
          <FileSpreadsheet className="size-3.5 text-emerald-600" />
          {ATTACHMENT}
        </span>
      )}
      <div className="bg-muted max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-6 whitespace-pre-wrap">
        <Seen lens={flip} pieces={ASK_PIECES} />
      </div>
      <div className="text-muted-foreground flex h-6 items-center gap-0.5 text-xs font-medium">
        <span className={cn("flex items-center gap-0.5", HOVER)}>
          <span className="px-1">12:39</span>
          <Action label="Копировать">
            <Copy />
          </Action>
          <Action label="Изменить">
            <Pencil />
          </Action>
        </span>
        {/* Значок у края сообщения: подпись растёт внутрь строки, сам он под указателем не сдвигается. */}
        {marked && (
          <Mark
            className={cn(!view.always && !lens && HOVER)}
            count={COUNT.ask}
            label={view.mode === "flip" ? "Так получила модель" : undefined}
            on={lens}
            onToggle={onLens}
            tip="Что получила модель"
          />
        )}
      </div>
      {marked && flip && att && <AttachmentLine name={ATTACHMENT} sent />}
      {marked && view.mode === "beside" && (
        <Expand className="w-full" open={lens}>
          <div className="flex flex-col items-end gap-1 pt-1 pb-0.5">
            <Caption>Так получила модель</Caption>
            <div className="max-w-[85%] rounded-2xl rounded-br-md border border-dashed px-4 py-2.5 text-sm leading-6 whitespace-pre-wrap">
              <Seen lens pieces={ASK_PIECES} />
            </div>
            {att && <AttachmentLine name={ATTACHMENT} sent />}
          </div>
        </Expand>
      )}
    </div>
  );
};

const Block = ({ label, children, className }: { label: string; children: ReactNode; className?: string }) => (
  <div className={cn("flex min-w-0 flex-col gap-1", className)}>
    <span className="p31-swap font-medium" key={label}>
      {label}
    </span>
    <pre className="bg-muted overflow-auto rounded-md p-2 font-mono whitespace-pre-wrap">{children}</pre>
  </div>
);

/** Развёрнутый вызов тула: вход и результат; со значком — то же глазами модели. */
const Call = ({ mode, lens }: { mode: Mode; lens: boolean }) =>
  mode === "flip" ? (
    <div className="text-muted-foreground flex flex-col gap-2 text-xs">
      <Block label={lens ? "Модель отправила" : "Вход"}>
        <Seen lens={lens} pieces={INPUT_PIECES} />
      </Block>
      <Block label={lens ? "Модель получила" : "Результат"}>
        <Seen lens={lens} pieces={OUTPUT_PIECES} />
      </Block>
    </div>
  ) : (
    // Пары в строку: слева как было, справа как у модели; в узкой ленте — друг под другом.
    <div className={cn("text-muted-foreground grid gap-2 text-xs", lens && "@xl:grid-cols-2")}>
      <Block label="Вход">
        <Seen lens={false} pieces={INPUT_PIECES} />
      </Block>
      {lens && (
        <Block className="p31-swap" label="Модель отправила">
          <Seen lens pieces={INPUT_PIECES} />
        </Block>
      )}
      <Block label="Результат">
        <Seen lens={false} pieces={OUTPUT_PIECES} />
      </Block>
      {lens && (
        <Block className="p31-swap" label="Модель получила">
          <Seen lens pieces={OUTPUT_PIECES} />
        </Block>
      )}
    </div>
  );

/** Шаг ленты, как в `activity.tsx`: вся строка раскрывает шаг, значок — отдельная кнопка поверх неё. */
const Step = ({
  icon,
  title,
  time,
  open,
  onToggle,
  mark,
  children,
}: {
  icon: ReactNode;
  title: string;
  time: string;
  open: boolean;
  onToggle: () => void;
  mark?: ReactNode;
  children: ReactNode;
}) => (
  <div className="group/message">
    <div className="hover:bg-muted/60 relative grid grid-cols-[1.25rem_1fr_auto_auto_0.875rem] items-center gap-2 rounded-md py-1 pr-1 text-sm transition-colors duration-150">
      <span className="bg-background text-muted-foreground relative z-10 grid size-5 place-items-center">{icon}</span>
      <button
        aria-expanded={open}
        className="text-muted-foreground min-w-0 truncate text-left outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:ring-2 focus-visible:after:ring-ring/50"
        onClick={onToggle}
        type="button"
      >
        {title}
      </button>
      <span className="relative z-10 flex">{mark}</span>
      <span className="text-muted-foreground text-xs tabular-nums">{time}</span>
      <ChevronRight className={cn("text-muted-foreground size-3.5 transition-transform duration-200", EASE, open && "rotate-90")} />
    </div>
    <Expand open={open}>
      <div className="pt-1 pb-2 pl-7">{children}</div>
    </Expand>
  </div>
);

/** Ответ: текст и строка действий; значок — у левого края, под началом текста. */
const Answered = ({
  view,
  lens,
  onLens,
  stream,
}: {
  view: View;
  lens: boolean;
  onLens: () => void;
  stream: ReturnType<typeof useStream>;
}) => {
  const model = view.local ? LOCAL : CLOUD;
  const flip = view.mode === "flip" && lens;
  return (
    <div className="group/message flex flex-col gap-2">
      {/* Подложка проявляется за текстом, не сдвигая его: всё внутри — слова модели как есть. */}
      <div className={cn("-mx-3 -my-1.5 rounded-xl px-3 py-1.5 transition-colors duration-200", flip && "bg-muted/60 dark:bg-muted/40")}>
        <p className="text-sm leading-7 whitespace-pre-wrap">
          <Seen lens={flip} pieces={stream.shown} />
        </p>
      </div>
      {!stream.done && (stream.holding ? <RestoringStatus className="h-6" /> : <span className="h-6" />)}
      {stream.done && (
        <div className="text-muted-foreground flex h-6 items-center gap-0.5 text-xs font-medium">
          {view.local ? (
            <Tooltip>
              <TooltipTrigger
                delay={300}
                render={<span className={cn("grid size-6 place-items-center", !view.always && HOVER)} />}
              >
                <Server className="size-3.5" />
              </TooltipTrigger>
              <Tip>Не покидало сервер: локальная модель получила текст как есть</Tip>
            </Tooltip>
          ) : (
            <Mark
              className={cn(!view.always && !lens && HOVER)}
              count={COUNT.answer}
              label={view.mode === "flip" ? "Так ответила модель" : undefined}
              on={lens}
              onToggle={onLens}
              tip="Что ответила модель"
            />
          )}
          <span className={cn("flex items-center gap-0.5", HOVER)}>
            <span className="mr-1 flex items-center gap-1.5">
              <span>{model.name}</span>
              <span aria-hidden="true">·</span>
              <span>12:40</span>
            </span>
            <Action label="Копировать">
              <Copy />
            </Action>
            <Action label="Полезно">
              <ThumbsUp />
            </Action>
            <Action label="Бесполезно">
              <ThumbsDown />
            </Action>
            <Action label="Ответить заново">
              <RefreshCw />
            </Action>
          </span>
        </div>
      )}
      {!view.local && view.mode === "beside" && (
        <Expand open={lens && stream.done}>
          <div className="flex flex-col gap-1 pb-0.5">
            <Caption>Так ответила модель, до восстановления</Caption>
            <p className="rounded-xl border border-dashed px-3.5 py-2 text-sm leading-7 whitespace-pre-wrap">
              <Seen lens pieces={ANSWER_PIECES} />
            </p>
          </div>
        </Expand>
      )}
    </div>
  );
};

type Key = "ask" | "tool" | "answer";

/** Значки: у каждого своё состояние; ручка `open` (приходит из адреса после первого кадра) нажимает все. */
const useLenses = (all: boolean) => {
  const [on, setOn] = useState<Record<Key, boolean>>({ answer: all, ask: all, tool: all });
  const [was, setWas] = useState(all);
  if (all !== was) {
    setWas(all);
    setOn({ answer: all, ask: all, tool: all });
  }
  return [on, (k: Key) => setOn((o) => ({ ...o, [k]: !o[k] }))] as const;
};

const Thread = ({ mode }: { mode: Mode }) => {
  const { knobs } = useProto();
  const phone = usePhone();
  const all = knobs.open === "1";
  const view: View = { always: knobs.mark === "always", local: knobs.src === "local", mode };
  const stream = useStream(ANSWER_PIECES, knobs.st === "stream");
  const [lens, toggle] = useLenses(all);
  const [steps, setSteps] = useState<Record<string, boolean>>({});
  const toolOpen = steps.crm ?? all;
  const step = (k: string, now: boolean) => setSteps((s) => ({ ...s, [k]: !now }));
  return (
    <ChatShell composer={<ComposerStub />}>
      <style>{LENS_CSS}</style>
      <div className="flex flex-col items-end">
        <div className="bg-muted max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-6">{PLAIN_ASK}</div>
      </div>
      <p className="text-sm leading-7">{PLAIN_ANSWER}</p>
      <Asked att={knobs.att === "yes"} lens={lens.ask} onLens={() => toggle("ask")} view={view} />
      <section className="flex w-full flex-col">
        <div className="flex w-full items-center gap-2 py-1 text-left text-sm">
          <span className="size-2 shrink-0 rounded-full bg-emerald-500" />
          <span className="text-muted-foreground min-w-0 truncate">Работал 3,1 с · 2 шага</span>
          <ChevronRight className="text-muted-foreground ml-auto size-4 shrink-0 rotate-90" />
        </div>
        <div className="before:bg-border relative pb-1 before:absolute before:top-3 before:bottom-3 before:left-[9px] before:w-px">
          <Step
            icon={<Brain className="size-3.5" />}
            onToggle={() => step("think", Boolean(steps.think))}
            open={Boolean(steps.think)}
            time="1,1 с"
            title="Обдумал"
          >
            <p className="text-muted-foreground text-sm italic">Нужны контакты из CRM, затем текст письма с новой датой.</p>
          </Step>
          <Step
            icon={<Wrench className="size-3.5" />}
            mark={
              !view.local && (
                <Mark
                  className={cn(!view.always && !lens.tool && HOVER)}
                  count={COUNT.tool}
                  label={toolOpen && mode === "flip" && !phone ? "Так видела модель" : undefined}
                  on={lens.tool && toolOpen}
                  onToggle={() => {
                    // Со свёрнутого шага значок сразу раскрывает его глазами модели.
                    if (!toolOpen) {
                      step("crm", false);
                      if (!lens.tool) toggle("tool");
                    } else toggle("tool");
                  }}
                  tip="Что модель отправила и получила"
                />
              )
            }
            onToggle={() => step("crm", toolOpen)}
            open={toolOpen}
            time="0,8 с"
            title="CRM · Найти контакт"
          >
            <Call lens={lens.tool && !view.local} mode={mode} />
          </Step>
        </div>
      </section>
      <Answered lens={lens.answer} onLens={() => toggle("answer")} stream={stream} view={view} />
    </ChatShell>
  );
};

/** 1 · «На месте». */
export const ThreadFlip = () => <Thread mode="flip" />;

/** 2 · «Рядом». */
export const ThreadBeside = () => <Thread mode="beside" />;
