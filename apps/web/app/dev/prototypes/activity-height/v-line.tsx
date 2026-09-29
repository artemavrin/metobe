"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@metobe/ui/components/popover";
import { cn } from "@metobe/ui/lib/utils";
import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

import { Expand, fmtSec, groupSteps, plural, StepDetail, StepIcon, stepTitle } from "../activity/parts";
import type { Item } from "../activity/parts";
import { useRun } from "../activity/run";
import type { StepView } from "../activity/run";
import { Stage } from "../activity/stage";
import { useProto } from "../activity/state";
import { CallList, callSummary, FadeBox, PhoneSheet, RibbonHeader, useOpen } from "./kit";

// «Одна строка»: каждый шаг — одна строка, всегда. Вход и результат открываются не на месте, а поверх (окошко у строки,
// на телефоне — шторка), поэтому лента не растёт ни от раскрытия, ни от длинных вызовов: только по строке на новый шаг.
// У идущего шага в строке бежит хвост — то, что он делает сейчас. Когда шаг ждёт разрешения, окошко открывается само.
// Цена: чтобы прочесть вход и результат, нужен лишний щелчок, и в окошке — только один шаг за раз.

const idOf = (it: Item) => (it.type === "step" ? it.v.step.id : it.id);
const viewsOf = (it: Item) => (it.type === "step" ? [it.v] : it.vs);

const groupLabel = (vs: StepView[]) => {
  const first = vs[0] as StepView;
  if (first.step.kind === "fetch") {
    return `Прочитано ${vs.length} ${plural(vs.length, ["страница", "страницы", "страниц"])}`;
  }
  return `${first.step.server ?? "Поиск"} · ${first.step.tool ?? ""} × ${vs.length}`;
};

/** Что шаг делает прямо сейчас — одной строкой: последние слова мысли, запрос, ключи входа. */
const tailOf = (v: StepView) => {
  const { step } = v;
  if (step.kind === "think") {
    const text = (step.text ?? "").slice(0, Math.ceil((step.text ?? "").length * Math.min(1, v.live * 1.1)));
    return text.slice(-90);
  }
  return callSummary(step);
};

const Detail = ({ it }: { it: Item }) =>
  it.type === "step" ? (
    <div className="pl-0">
      <StepDetail controls v={it.v} />
    </div>
  ) : (
    <CallList slot="h-40" surface="bg-popover" vs={it.vs} />
  );

const Body = () => {
  const r = useRun();
  const { phone } = useProto();
  const [open, toggle] = useOpen();
  const [sel, setSel] = useState<string | null>(null);
  const items = groupSteps(r.views);
  const waiting = items.find((it) => viewsOf(it).some((v) => v.state === "waiting"));
  const waitingId = waiting ? idOf(waiting) : null;
  useEffect(() => {
    if (waitingId) {
      setSel(waitingId);
    }
  }, [waitingId]);
  const selected = items.find((it) => idOf(it) === sel) ?? null;
  return (
    <section className="flex w-full flex-col">
      <RibbonHeader onToggle={toggle} open={open} />
      <Expand open={open}>
        <div className="before:bg-border relative pb-2 before:absolute before:top-3 before:bottom-3 before:left-[9px] before:w-px">
          {items.map((it) => {
            const id = idOf(it);
            const vs = viewsOf(it);
            const last = vs.at(-1) as StepView;
            const running = vs.some((v) => v.state === "running");
            const state = vs.find((v) => v.state === "error")?.state ?? last.state;
            const ms = vs.reduce((s, v) => s + v.ms, 0);
            const label = it.type === "step" ? stepTitle(it.v) : groupLabel(it.vs);
            const tail = running ? tailOf(last) : "";
            const row = (
              <span className="hover:bg-muted/60 grid w-full grid-cols-[1.25rem_1fr_auto_0.875rem] items-center gap-2 rounded-md py-1 pr-1 text-left text-sm transition-colors duration-150">
                <StepIcon surface="bg-background" v={{ ...last, ms, state }} />
                <span className="min-w-0 truncate">
                  <span className={cn(running && "shimmer", state === "waiting" && "text-amber-700 dark:text-amber-300", state === "error" && "text-destructive", state === "done" && "text-muted-foreground")}>{label}</span>
                  {tail && <span className="text-muted-foreground"> — {tail}</span>}
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">{state === "waiting" ? "" : fmtSec(ms)}</span>
                <ChevronRight className="text-muted-foreground size-3.5" />
              </span>
            );
            const wrap = "animate-in fade-in slide-in-from-bottom-1 block w-full duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:slide-in-from-bottom-0";
            if (phone) {
              return (
                <button className={wrap} key={id} onClick={() => setSel(sel === id ? null : id)} type="button">
                  {row}
                </button>
              );
            }
            return (
              <Popover key={id} onOpenChange={(o) => setSel(o ? id : null)} open={sel === id}>
                <PopoverTrigger render={<button className={wrap} type="button" />}>{row}</PopoverTrigger>
                <PopoverContent align="start" className="w-[min(30rem,calc(100vw-2rem))] gap-0 p-0" side="bottom" sideOffset={4}>
                  <div className="border-b px-3 py-2 text-sm font-medium">{label}</div>
                  <FadeBox className="max-h-96 px-3 py-2" follow={running}>
                    <Detail it={it} />
                  </FadeBox>
                </PopoverContent>
              </Popover>
            );
          })}
        </div>
      </Expand>
      <PhoneSheet onClose={() => setSel(null)} open={phone && selected !== null} title={selected ? (selected.type === "step" ? stepTitle(selected.v) : groupLabel(selected.vs)) : ""}>
        {selected && <Detail it={selected} />}
      </PhoneSheet>
    </section>
  );
};

export const LineRibbon = () => <Stage activity={<Body />} />;
