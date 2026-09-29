"use client";

import { Button } from "@metobe/ui/components/button";
import { cn } from "@metobe/ui/lib/utils";
import { ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";

import type { Step } from "../activity/data";
import { fmtSec, Loader, StepIcon, StepDetail, stepTitle, summary } from "../activity/parts";
import { useRun } from "../activity/run";
import type { StepView } from "../activity/run";

// P4b · «Высота ленты»: общие части четырёх вариантов — окно с затуханием, шапка ленты, список вызовов одного тула,
// шторка телефона. Сама лента (шаги, их состояния, проигрыватель) — из прототипа «Активность ответа».

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

/**
 * Окно: содержимое выше своего max-height прокручивается, край, за которым есть ещё, затухает. С `follow` держит
 * конец в поле зрения, пока содержимое растёт (пока читатель не прокрутит вверх сам).
 */
export const FadeBox = ({ className, follow = false, children }: { className?: string; follow?: boolean; children: React.ReactNode }) => {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const atEnd = useRef(true);
  const [edges, setEdges] = useState({ bottom: false, top: false });
  const measure = () => {
    const b = box.current;
    if (!b) {
      return;
    }
    const next = { bottom: b.scrollHeight - b.scrollTop - b.clientHeight > 1, top: b.scrollTop > 1 };
    setEdges((was) => (was.top === next.top && was.bottom === next.bottom ? was : next));
  };
  useEffect(() => {
    const b = box.current;
    const i = inner.current;
    if (!b || !i) {
      return;
    }
    const observer = new ResizeObserver(() => {
      if (follow && atEnd.current) {
        b.scrollTo({ behavior: "instant", top: b.scrollHeight });
      }
      measure();
    });
    observer.observe(i);
    return () => observer.disconnect();
  }, [follow]);
  const overflows = edges.top || edges.bottom;
  return (
    <div
      className={cn("no-scrollbar overflow-y-auto outline-none motion-safe:scroll-smooth", overflows && "scroll-fade-y scroll-fade-8", className)}
      onScroll={(e) => {
        const b = e.currentTarget;
        atEnd.current = b.scrollHeight - b.scrollTop - b.clientHeight < 4;
        measure();
      }}
      ref={box}
      style={overflows ? ({ "--scroll-fade-b": edges.bottom ? "2rem" : "0px", "--scroll-fade-t": edges.top ? "2rem" : "0px" } as CSSProperties) : undefined}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- прокручиваемая область берёт фокус, чтобы листать с клавиатуры
      tabIndex={overflows ? 0 : undefined}
    >
      <div ref={inner}>{children}</div>
    </div>
  );
};

const DOT: Record<string, string> = { done: "bg-emerald-500", stopped: "bg-muted-foreground", waiting: "bg-amber-500", working: "bg-blue-500" };
const LABEL: Record<string, string> = { done: "Готово", stopped: "Остановлено", waiting: "Ждёт разрешения", working: "Работает" };

/** Шапка ленты: статус и часы; когда всё готово — «Работал … шагов … токенов». Нажатие раскрывает и сворачивает. */
export const RibbonHeader = ({ open, onToggle }: { open: boolean; onToggle: () => void }) => {
  const r = useRun();
  const finished = r.phase === "done" || r.phase === "stopped";
  return (
    <button aria-expanded={open} className="flex w-full items-center gap-2 py-1 text-left text-sm" onClick={onToggle} type="button">
      <span className={cn("size-2 shrink-0 rounded-full transition-colors duration-200", DOT[r.phase])} />
      <span className={cn("animate-in fade-in flex min-w-0 items-center gap-2 duration-150", EASE)} key={finished ? "summary" : r.phase}>
        {finished ? (
          <span className="text-muted-foreground min-w-0 truncate">{summary(r.views, r.elapsed)}</span>
        ) : (
          <>
            <span className="font-medium">{LABEL[r.phase]}</span>
            <span className="text-muted-foreground text-xs tabular-nums">{fmtSec(r.elapsed)}</span>
          </>
        )}
      </span>
      <ChevronRight className={cn("text-muted-foreground ml-auto size-4 shrink-0 transition-transform duration-200", EASE, open && "rotate-90")} />
    </button>
  );
};

/** Лента раскрыта сама, пока идёт работа; когда закончилась — сворачивается (нажатие читателя главнее). */
export const useOpen = () => {
  const r = useRun();
  const [chosen, setChosen] = useState<boolean | null>(null);
  const finished = r.phase === "done" || r.phase === "stopped";
  const open = chosen ?? !finished;
  return [open, () => setChosen(!open)] as const;
};

/** Одна строка о вызове: что в него ушло — по ключам входа. */
export const callSummary = (step: Step) => {
  if (step.input) {
    try {
      const o = JSON.parse(step.input) as Record<string, unknown>;
      return Object.entries(o)
        .filter(([, v]) => typeof v === "string")
        .map(([k, v]) => `${k}: ${String(v)}`)
        .slice(0, 3)
        .join(" · ");
    } catch {
      return step.input.slice(0, 60);
    }
  }
  return (step.args ?? []).map(([k, v]) => `${k}: ${v}`).join(" · ");
};

/**
 * Вызовы одного тула: номера с краткой сводкой и ОДИН слот с входом и результатом выбранного вызова — фиксированной
 * высоты, содержимое в нём просто меняется. Пока идёт работа, выбран новейший вызов и слот следует за ним; нажатие
 * читателя закрепляет выбор. Шесть длинных вызовов — это шесть строк (или значков) и один слот, а не шесть окон, что
 * открываются и закрываются друг за другом.
 * `chips` — вызовы значками в ряд (для тесной сцены), иначе — строками с краткой сводкой.
 */
export const CallList = ({ vs, slot, surface, chips = false }: { vs: StepView[]; slot: string; surface: string; chips?: boolean }) => {
  const [picked, setPicked] = useState<string | null>(null);
  const last = vs.at(-1) as StepView;
  const current = vs.find((v) => v.step.id === picked) ?? last;
  return (
    <div className="flex flex-col gap-1">
      <div className={cn(chips ? "flex flex-wrap gap-1" : "flex flex-col")}>
        {vs.map((v, i) => {
          const on = v.step.id === current.step.id;
          const pick = () => setPicked(v.step.id === last.step.id ? null : v.step.id);
          return chips ? (
            <button
              aria-pressed={on}
              className={cn("hover:bg-muted/70 flex h-6 items-center gap-1 rounded-md px-1.5 text-xs transition-colors duration-150", on && "bg-muted")}
              key={v.step.id}
              onClick={pick}
              type="button"
            >
              <StepIcon surface="bg-transparent" v={v} />
              <span className="text-muted-foreground tabular-nums">№{i + 1}</span>
            </button>
          ) : (
            <button
              aria-pressed={on}
              className={cn(
                "hover:bg-muted/60 grid w-full grid-cols-[1.25rem_1.5rem_1fr_auto] items-center gap-2 rounded-md py-1 pr-1 text-left text-xs transition-colors duration-150",
                on && "bg-muted/50"
              )}
              key={v.step.id}
              onClick={pick}
              type="button"
            >
              <StepIcon surface="bg-transparent" v={v} />
              <span className="text-muted-foreground tabular-nums">№{i + 1}</span>
              <span className={cn("min-w-0 truncate", v.state === "error" && "text-destructive", v.state === "running" && "shimmer")}>{callSummary(v.step)}</span>
              <span className="text-muted-foreground tabular-nums">{v.state === "waiting" ? "" : fmtSec(v.ms)}</span>
            </button>
          );
        })}
      </div>
      <FadeBox className={cn("pl-1", slot)} follow={current.state === "running"} key={current.step.id}>
        <div className="pb-2">
          <StepDetail controls v={current} />
        </div>
      </FadeBox>
    </div>
  );
};

/** Шторка телефона внутри кадра телефона (как у меню аккаунта): закрывается нажатием на затемнение. */
export const PhoneSheet = ({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) => {
  const frame = open ? document.querySelector("[data-phone-frame]") : null;
  if (!frame) {
    return null;
  }
  return createPortal(
    <div className="absolute inset-0 z-50 flex items-end">
      <button aria-label="Закрыть" className="absolute inset-0 bg-black/30" onClick={onClose} type="button" />
      <div className={cn("bg-popover text-popover-foreground animate-in slide-in-from-bottom-6 fade-in-0 relative flex max-h-[75%] w-full flex-col rounded-t-2xl shadow-lg duration-200 motion-reduce:animate-none")}>
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
          <Button aria-label="Закрыть" onClick={onClose} size="icon-sm" variant="ghost">
            <X />
          </Button>
        </div>
        <FadeBox className="min-h-0 px-3 py-3">{children}</FadeBox>
      </div>
    </div>,
    frame
  );
};

export { Loader, stepTitle };
