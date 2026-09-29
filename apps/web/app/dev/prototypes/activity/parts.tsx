"use client";

import { Button } from "@metobe/ui/components/button";
import { cn } from "@metobe/ui/lib/utils";
import { Ban, Brain, ChevronRight, CircleAlert, Clock, FileText, Mail, Plug, Search } from "lucide-react";
import { GridLoader } from "gridora";
import { useState } from "react";

import type { Step, StepKind } from "./data";
import { useRun } from "./run";
import type { StepView } from "./run";

// Общие части всех вариантов: строка шага, его содержимое по типу, подтверждение письма, группы одинаковых вызовов
// и сворачивание длинной серии. Слова — те же, что уже в чате («Ищет в интернете», «Читает страницу», «Ждёт разрешения»).

// Кривая и появление — как везде в приложении (`web-step.tsx`): сильный ease-out; шаг выезжает на 4 px и проявляется.
const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";
// При reduced motion остаётся проявление (оно помогает понять, что появилось), уходит сдвиг.
const APPEAR = `animate-in fade-in slide-in-from-bottom-1 duration-200 ${EASE} motion-reduce:slide-in-from-bottom-0`;

const ICON: Record<StepKind, React.ComponentType<{ className?: string }>> = {
  fetch: FileText,
  mail: Mail,
  search: Search,
  think: Brain,
  tools: Search,
  tool: Plug,
};

export const fmtSec = (ms: number) =>
  `${(ms / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} с`;

export const plural = (n: number, forms: [string, string, string]) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) {
    return forms[0];
  }
  return m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? forms[1] : forms[2];
};

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return url;
  }
};

export const Loader = () => <GridLoader cellSize={3} gap={1.5} respectReducedMotion variant="cacheWarm" />;

/** Складывает подряд идущие вызовы одного тула, одного поиска и чтения страниц в одну строку-группу. */
export type Item = { type: "step"; v: StepView } | { type: "group"; id: string; vs: StepView[] };

const sameKind = (a: Step, b: Step) => a.kind === b.kind && a.kind !== "think" && a.kind !== "mail" && a.kind !== "tools" && a.tool === b.tool;

export const groupSteps = (views: StepView[]): Item[] => {
  const out: Item[] = [];
  for (const v of views) {
    const last = out.at(-1);
    if (last?.type === "step" && sameKind(last.v.step, v.step)) {
      out[out.length - 1] = { id: `g-${last.v.step.id}`, type: "group", vs: [last.v, v] };
    } else if (last?.type === "group" && sameKind((last.vs[0] as StepView).step, v.step)) {
      last.vs.push(v);
    } else {
      out.push({ type: "step", v });
    }
  }
  return out;
};

/** Заголовок шага: идёт — «Ищет в интернете», закончен — «Поиск». Формальный регистр, как в чате. */
export const stepTitle = (v: StepView) => {
  const { step, state } = v;
  const running = state === "running";
  switch (step.kind) {
    case "think": {
      return running || state === "stopped" ? "Думает…" : "Подумал";
    }
    case "search": {
      return running ? `Ищет в интернете · «${step.query}»` : `Поиск · «${step.query}»`;
    }
    case "tools": {
      const n = step.results?.length ?? 0;
      const found = n === 0 ? "Инструменты не найдены" : `Найдено ${n} ${plural(n, ["инструмент", "инструмента", "инструментов"])}`;
      return `${running ? "Ищет инструменты" : found} · «${step.query}»`;
    }
    case "fetch": {
      return `${running ? "Читает страницу" : "Прочитано"} · ${step.title ?? host(step.url ?? "")}`;
    }
    case "tool": {
      return `${step.server} · ${step.tool}${state === "error" ? " — ошибка" : ""}`;
    }
    case "mail": {
      if (state === "waiting") {
        return "Ждёт разрешения · письмо";
      }
      if (state === "denied") {
        return "Письмо не отправлено";
      }
      return running ? `Пишет письмо · ${step.mail?.subject}` : `Письмо отправлено · ${step.mail?.to}`;
    }
    default: {
      return "";
    }
  }
};

export const StepIcon = ({ v, surface }: { v: StepView; surface: string }) => {
  const Icon = ICON[v.step.kind];
  let inner = <Icon className="size-3.5" />;
  let tint = "text-muted-foreground";
  if (v.state === "running") {
    inner = <Loader />;
  } else if (v.state === "waiting") {
    inner = <Clock className="size-3.5" />;
    tint = "text-amber-600 dark:text-amber-400";
  } else if (v.state === "error") {
    inner = <CircleAlert className="size-3.5" />;
    tint = "text-destructive";
  } else if (v.state === "denied" || v.state === "stopped") {
    inner = <Ban className="size-3.5" />;
  }
  // Значок меняется вместе с состоянием: новый проявляется с 90 %, чтобы смена читалась как «шаг закончился».
  return (
    <span className={cn("relative z-10 grid size-5 place-items-center transition-colors duration-200", tint, surface)}>
      <span
        className={cn("animate-in fade-in zoom-in-90 grid place-items-center duration-150", EASE, "motion-reduce:zoom-in-100")}
        key={v.state}
      >
        {inner}
      </span>
    </span>
  );
};

/** Раскрытие на месте: высота — по строкам сетки, без подсчёта в пикселях. Закрытое содержимое недоступно с клавиатуры. */
export const Expand = ({ open, children }: { open: boolean; children: React.ReactNode }) => (
  <div
    className={cn(
      // Открывается чуть медленнее, чем закрывается: открытое человек читает, закрытое уже прочитал.
      "grid transition-[grid-template-rows,opacity]",
      EASE,
      "motion-reduce:[transition-property:opacity]",
      open ? "grid-rows-[1fr] opacity-100 duration-200" : "grid-rows-[0fr] opacity-0 duration-150"
    )}
    inert={!open}
  >
    <div className="min-h-0 overflow-hidden">{children}</div>
  </div>
);

const shown = (total: number, live: number) => Math.max(0, Math.min(total, Math.ceil(total * Math.min(1, live * 1.3))));

const Meta = ({ children }: { children: React.ReactNode }) => (
  <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[11px]">{children}</span>
);

/** Письмо, которое ждёт разрешения: кому, тема, текст — и две кнопки. Кнопки только у ждущего шага. */
const Letter = ({ v, controls }: { v: StepView; controls: boolean }) => {
  const r = useRun();
  const mail = v.step.mail;
  if (!mail) {
    return null;
  }
  const waiting = v.state === "waiting";
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3 text-sm transition-colors duration-200",
        waiting ? "border-amber-500/40 bg-amber-500/5" : "bg-muted/40"
      )}
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Кому</dt>
        <dd className="font-mono">{mail.to}</dd>
        <dt className="text-muted-foreground">Тема</dt>
        <dd>{mail.subject}</dd>
      </dl>
      <p className="text-muted-foreground border-t pt-2 text-xs leading-relaxed whitespace-pre-line">{mail.body}</p>
      <Expand open={waiting && controls}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
          <span className="text-xs text-amber-700 dark:text-amber-300">Модель написала письмо от вашего имени — проверьте перед отправкой.</span>
          <span className="flex gap-2">
            <Button className="transition-transform duration-150 active:scale-[0.97]" onClick={r.deny} size="sm" variant="ghost">
              Не отправлять
            </Button>
            <Button className="transition-transform duration-150 active:scale-[0.97]" onClick={r.approve} size="sm">
              Отправить
            </Button>
          </span>
        </div>
      </Expand>
      {waiting && !controls && <span className="text-xs text-amber-700 dark:text-amber-300">Ждёт вашего разрешения ниже.</span>}
      {v.state === "denied" && <span className="text-muted-foreground text-xs">Не отправлено по вашему решению.</span>}
    </div>
  );
};

/** Вход и результат вызова тула, как их показывает чат: JSON и текст в своих блоках. */
export const CallBlocks = ({ step }: { step: Step }) => (
  <div className="text-muted-foreground flex flex-col gap-2 text-xs">
    <div className="flex flex-col gap-1">
      <span className="font-medium">Вход</span>
      <pre className="bg-muted overflow-auto rounded-md p-2 whitespace-pre-wrap">{step.input}</pre>
    </div>
    {step.output && (
      <div className="flex flex-col gap-1">
        <span className="font-medium">Результат</span>
        <pre className={cn("bg-muted overflow-auto rounded-md p-2 whitespace-pre-wrap", step.fail && "text-destructive")}>{step.output}</pre>
      </div>
    )}
  </div>
);

/** То, что шаг показывает внутри себя; на идущем шаге оно «дописывается» по мере продвижения. */
export const StepDetail = ({ v, controls }: { v: StepView; controls: boolean }) => {
  const r = useRun();
  const { step, live } = v;
  const running = v.state === "running";
  const body = (() => {
    switch (step.kind) {
      case "think": {
        const text = step.text ?? "";
        return (
          <p className="text-muted-foreground text-sm leading-relaxed">
            {running ? text.slice(0, Math.ceil(text.length * Math.min(1, live * 1.1))) : text}
          </p>
        );
      }
      case "search": {
        const results = step.results ?? [];
        return (
          <ul className="flex flex-col gap-1">
            {results.slice(0, running ? shown(results.length, live) : results.length).map((res) => (
              <li className="flex items-baseline gap-2 text-sm" key={res.title}>
                <span className="text-muted-foreground w-28 shrink-0 truncate font-mono text-xs">{res.host}</span>
                <span className="min-w-0 truncate">{res.title}</span>
              </li>
            ))}
          </ul>
        );
      }
      case "tools": {
        const results = step.results ?? [];
        return results.length === 0 ? null : (
          <ul className="flex flex-col gap-1">
            {results.slice(0, running ? shown(results.length, live) : results.length).map((res) => (
              <li className="flex items-baseline gap-2 text-sm" key={res.title}>
                <span className="text-muted-foreground w-28 shrink-0 truncate font-mono text-xs">{res.host}</span>
                <span className="min-w-0 truncate">{res.title.replaceAll("_", " ")}</span>
              </li>
            ))}
          </ul>
        );
      }
      case "fetch": {
        return (
          <p className="text-sm">
            <span className="text-muted-foreground font-mono text-xs">{host(step.url ?? "")}</span>
            {(!running || live > 0.6) && <span className="ml-2">{step.title}</span>}
          </p>
        );
      }
      case "tool": {
        const rows = step.rows ?? [];
        if (step.input) {
          return <CallBlocks step={step} />;
        }
        return (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Meta>{step.server}</Meta>
              {(step.args ?? []).map(([k, val]) => (
                <Meta key={k}>
                  {k}: {val}
                </Meta>
              ))}
            </div>
            {v.state === "error" && step.fail && (
              <div className="border-destructive/30 bg-destructive/5 flex flex-col gap-1.5 rounded-lg border p-3 text-sm">
                <span className="text-destructive font-medium">{step.fail.reason}</span>
                <span className="text-muted-foreground text-xs">{step.fail.hint}</span>
                {step.fail.action && (
                  <Button className="w-fit" onClick={() => r.go("/settings/connections")} size="sm" variant="outline">
                    {step.fail.action}
                  </Button>
                )}
              </div>
            )}
            {rows.length > 0 && (!running || live > 0.5) && (
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                {rows.map(([k, val]) => (
                  <div className="col-span-2 grid grid-cols-subgrid" key={k}>
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="tabular-nums">{val}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        );
      }
      case "mail": {
        return <Letter controls={controls} v={v} />;
      }
      default: {
        return null;
      }
    }
  })();
  return <div className="pt-1 pb-2 pl-7">{body}</div>;
};

/** Строка шага: значок, заголовок, время; раскрывается нажатием. Идущий, ждущий и упавший шаги раскрыты сами. */
const Row = ({
  v,
  surface,
  controls,
  open,
  onToggle,
  nested,
  renderDetail,
}: {
  v: StepView;
  surface: string;
  controls: boolean;
  open: boolean;
  onToggle: () => void;
  nested?: boolean;
  renderDetail?: (v: StepView) => React.ReactNode;
}) => {
  const active = v.state === "running";
  return (
    <div className={APPEAR}>
      <button
        aria-expanded={open}
        className={cn(
          "hover:bg-muted/60 transition-colors duration-150 grid w-full grid-cols-[1.25rem_1fr_auto_0.875rem] items-center gap-2 rounded-md py-1 text-left text-sm",
          nested ? "pr-1 pl-0" : "pr-1 pl-0"
        )}
        onClick={onToggle}
        type="button"
      >
        <StepIcon surface={surface} v={v} />
        <span
          className={cn(
            "min-w-0 truncate transition-colors duration-200",
            active && "shimmer",
            v.state === "waiting" && "text-amber-700 dark:text-amber-300",
            v.state === "error" && "text-destructive",
            !active && v.state === "done" && "text-muted-foreground"
          )}
        >
          {stepTitle(v)}
        </span>
        <span className="text-muted-foreground text-xs tabular-nums">{v.state === "waiting" ? "" : fmtSec(v.ms)}</span>
        <ChevronRight className={cn("text-muted-foreground size-3.5 transition-transform duration-200", EASE, open && "rotate-90")} />
      </button>
      <Expand open={open}>{renderDetail ? renderDetail(v) : <StepDetail controls={controls} v={v} />}</Expand>
    </div>
  );
};

export const autoOpen = (v: StepView) => v.state === "running" || v.state === "waiting" || v.state === "error";

/**
 * Лента шагов: линия слева, значок по типу, время справа. Одинаковые подряд вызовы — одна группа («1С · get_stock × 5»),
 * а длинная серия закончившихся шагов сворачивается в «Ещё N шагов»: видны последние, остальное — по нажатию.
 */
export const Timeline = ({
  views,
  surface,
  controls = true,
  fold = true,
  renderDetail,
  renderGroup,
}: {
  views: StepView[];
  surface: string;
  controls?: boolean;
  fold?: boolean;
  /** How a step shows its content when open; by default in place, as it comes. */
  renderDetail?: (v: StepView) => React.ReactNode;
  /** How a group of calls shows itself when open; by default a row per call. */
  renderGroup?: (vs: StepView[]) => React.ReactNode;
}) => {
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [unfolded, setUnfolded] = useState(false);
  const items = groupSteps(views);
  const KEEP = 3;
  const foldable = fold && items.length > KEEP + 2 ? items.slice(0, items.length - KEEP) : [];
  const folded = !unfolded && foldable.length > 0 && foldable.every((it) => (it.type === "step" ? !autoOpen(it.v) : it.vs.every((x) => !autoOpen(x))));
  const idOf = (it: Item) => (it.type === "step" ? it.v.step.id : it.id);
  // Свёрнутые строки остаются на месте, но закрытыми: уходят плавно, а не проваливаются (иначе всё ниже прыгает вверх).
  const hidden = new Set(folded ? foldable.map(idOf) : []);
  const hiddenViews = folded ? foldable.flatMap((it) => (it.type === "step" ? [it.v] : it.vs)) : [];
  const flip = (id: string, current: boolean) => setToggled((t) => ({ ...t, [id]: !current }));
  const render = (it: Item) => {
        if (it.type === "step") {
          const id = it.v.step.id;
          const open = toggled[id] ?? autoOpen(it.v);
          return <Row controls={controls} onToggle={() => flip(id, open)} open={open} renderDetail={renderDetail} surface={surface} v={it.v} />;
        }
        const first = it.vs[0] as StepView;
        const last = it.vs.at(-1) as StepView;
        const anyActive = it.vs.some(autoOpen);
        const open = toggled[it.id] ?? anyActive;
        const groupView: StepView = {
          ...last,
          ms: it.vs.reduce((s, x) => s + x.ms, 0),
          state: it.vs.find((x) => x.state === "error")?.state ?? last.state,
        };
        const label =
          first.step.kind === "fetch"
            ? `Прочитано ${it.vs.length} ${plural(it.vs.length, ["страница", "страницы", "страниц"])}`
            : `${first.step.server ?? "Поиск"} · ${first.step.tool ?? ""} × ${it.vs.length}`;
        return (
          <div className={APPEAR}>
            <button
              aria-expanded={open}
              className="hover:bg-muted/60 grid w-full grid-cols-[1.25rem_1fr_auto_0.875rem] items-center gap-2 rounded-md py-1 pr-1 text-left text-sm transition-colors duration-150"
              onClick={() => flip(it.id, open)}
              type="button"
            >
              <StepIcon surface={surface} v={groupView} />
              <span className={cn("min-w-0 truncate transition-colors duration-200", last.state === "running" ? "shimmer" : "text-muted-foreground", groupView.state === "error" && "text-destructive")}>
                {label}
              </span>
              <span className="text-muted-foreground text-xs tabular-nums">{fmtSec(groupView.ms)}</span>
              <ChevronRight className={cn("text-muted-foreground size-3.5 transition-transform duration-200", EASE, open && "rotate-90")} />
            </button>
            <Expand open={open}>
              <div className="pl-5">
                {renderGroup
                  ? renderGroup(it.vs)
                  : it.vs.map((x) => {
                      const id = x.step.id;
                      const o = toggled[id] ?? autoOpen(x);
                      return <Row controls={controls} key={id} nested onToggle={() => flip(id, o)} open={o} renderDetail={renderDetail} surface={surface} v={x} />;
                    })}
              </div>
            </Expand>
          </div>
        );
  };
  return (
    <div className="relative before:bg-border before:absolute before:top-3 before:bottom-3 before:left-[9px] before:w-px">
      {folded && (
        <button
          className={cn("text-muted-foreground hover:bg-muted/60 relative grid w-full grid-cols-[1.25rem_1fr_auto] items-center gap-2 rounded-md py-1 text-left text-sm transition-colors duration-150", APPEAR)}
          onClick={() => setUnfolded(true)}
          type="button"
        >
          <span className={cn("relative z-10 grid size-5 place-items-center", surface)}>
            <ChevronRight className="size-3.5 rotate-90" />
          </span>
          <span>
            Ещё {hiddenViews.length} {plural(hiddenViews.length, ["шаг", "шага", "шагов"])}
          </span>
          <span className="text-xs tabular-nums">{fmtSec(hiddenViews.reduce((s, x) => s + x.ms, 0))}</span>
        </button>
      )}
      {items.map((it) => (
        <Expand key={idOf(it)} open={!hidden.has(idOf(it))}>
          {render(it)}
        </Expand>
      ))}
    </div>
  );
};

export const summary = (views: StepView[], elapsed: number) => {
  const errors = views.filter((v) => v.state === "error").length;
  return [
    `Работал ${fmtSec(elapsed)}`,
    `${views.length} ${plural(views.length, ["шаг", "шага", "шагов"])}`,
    errors ? `${errors} ${plural(errors, ["ошибка", "ошибки", "ошибок"])}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
};
