"use client";

import { cn } from "@metobe/ui/lib/utils";
import { useId, useState } from "react";

import { Tip, at } from "../metrics/atoms";
import { compact, exactOf, percent, signed } from "../metrics/format";
import { COMPOSITION, DOCS, DOTS, FENCE, FUNNEL, MAX, MEDIAN, MOVERS, OUTLIERS, PARETO, Q1, Q3, WHOLE } from "./data";

// The looks of the new forms, in the strip's style: no cards, hairline structure, one accent (the theme's first chart
// color), semantic color only where it means good or bad.

const short = (n: number) => `${compact(n).value}${compact(n).scale}`;
const rub = (n: number) => `${short(n)} ₽`;
const plus = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${short(Math.abs(n))} ₽`;

const GOOD = "var(--success)";
const BAD = "var(--destructive)";
const ACCENT = "var(--chart-1)";

/** A big figure and what it counts: «4 из 12 — клиентов дают 80 % выручки». */
const Headline = ({ big, small, note }: { big: React.ReactNode; small: string; note?: string }) => (
  <div className="m-in flex flex-col gap-1" style={at(0)}>
    <span className="text-3xl font-medium tracking-tight tabular-nums sm:text-4xl">{big}</span>
    <span className="text-sm">{small}</span>
    {note && <span className="text-muted-foreground text-xs">{note}</span>}
  </div>
);

// ═══ Кто вырос и упал ═══════════════════════════════════════════════════════════════════════════════════════════

const growers = MOVERS.filter((m) => m.change > 0).slice(0, 4);
const fallers = MOVERS.filter((m) => m.change < 0).slice(-4).reverse();
const maxAbs = Math.max(...[...growers, ...fallers].map((m) => Math.abs(m.change)));
const net = MOVERS.reduce((a, m) => a + m.change, 0);

const moverTip = (m: (typeof MOVERS)[number]) => `${exactOf(m.before)} → ${exactOf(m.after)}${m.pct === null ? "" : ` · ${signed(m.pct)} %`}`;

const MoversHead = () => (
  <Headline
    big={<span style={{ color: net >= 0 ? GOOD : BAD }}>{plus(net)}</span>}
    note="Сентябрь к августу, по клиентам"
    small={`Выручка изменилась: выросли ${MOVERS.filter((m) => m.change > 0).length} клиентов, упали ${MOVERS.filter((m) => m.change < 0).length}`}
  />
);

const MoverRow = ({ m, i, side }: { m: (typeof MOVERS)[number]; i: number; side?: "left" | "right" }) => {
  const up = m.change > 0;
  return (
    <li className="m-in grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-2 text-sm" style={at(i + 1)}>
      <span className="truncate" title={m.name}>{m.name}</span>
      <span className="bg-muted relative h-1.5 overflow-hidden rounded-full">
        <span
          className="m-fill absolute inset-y-0 rounded-full"
          style={{
            background: up ? GOOD : BAD,
            transformOrigin: side === "right" ? "right center" : "left center",
            width: `${(Math.abs(m.change) / maxAbs) * 100}%`,
            ...(side === "right" ? { right: 0 } : { left: 0 }),
          }}
        />
      </span>
      <Tip className="text-xs tabular-nums" tip={moverTip(m)}>
        <span style={{ color: up ? GOOD : BAD }}>{plus(m.change)}</span>
      </Tip>
    </li>
  );
};

export const MoversColumns = () => (
  <div className="flex flex-col gap-5">
    <MoversHead />
    <div className="grid gap-x-10 gap-y-5 @lg:grid-cols-2">
      <div className="flex flex-col gap-2.5">
        <span className="text-muted-foreground text-xs">Выросли</span>
        <ol className="flex flex-col gap-1.5">{growers.map((m, i) => <MoverRow i={i} key={m.name} m={m} />)}</ol>
      </div>
      <div className="flex flex-col gap-2.5">
        <span className="text-muted-foreground text-xs">Упали</span>
        <ol className="flex flex-col gap-1.5">{fallers.map((m, i) => <MoverRow i={i + 4} key={m.name} m={m} />)}</ol>
      </div>
    </div>
  </div>
);

export const MoversDiverging = () => (
  <div className="flex flex-col gap-5">
    <MoversHead />
    <ol className="flex flex-col gap-1.5">
      {[...growers, ...fallers].map((m, i) => {
        const up = m.change > 0;
        const w = (Math.abs(m.change) / maxAbs) * 50;
        return (
          <li className="m-in grid grid-cols-[minmax(0,7.5rem)_1fr_4.5rem] items-center gap-2 text-sm" key={m.name} style={at(i + 1)}>
            <span className="truncate" title={m.name}>{m.name}</span>
            <span className="relative h-5">
              <span aria-hidden className="bg-foreground/15 absolute inset-y-0 left-1/2 w-px" />
              <span
                className="m-fill absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
                style={{ background: up ? GOOD : BAD, left: up ? "50%" : `${50 - w}%`, transformOrigin: up ? "left center" : "right center", width: `${w}%` }}
              />
            </span>
            <Tip className="text-right text-xs tabular-nums" tip={moverTip(m)}>
              <span style={{ color: up ? GOOD : BAD }}>{plus(m.change)}</span>
            </Tip>
          </li>
        );
      })}
    </ol>
  </div>
);

// ═══ Парето / ABC ═══════════════════════════════════════════════════════════════════════════════════════════════

const n80 = PARETO.findIndex((p) => p.cum >= 0.8) + 1;
const classes = (["A", "B", "C"] as const).map((c) => {
  const rows = PARETO.filter((p) => p.cls === c);
  return { cls: c, count: rows.length, share: rows.reduce((a, r) => a + r.value, 0) / WHOLE };
});
const CLASS_OPACITY = { A: 1, B: 0.55, C: 0.25 } as const;

const ParetoHead = () => <Headline big={<>{n80} из {PARETO.length}</>} note="Клиенты, отсортированные по выручке, нарастающим итогом" small="клиентов дают 80 % выручки" />;

export const ParetoCurve = () => {
  const id = useId();
  const w = 400;
  const h = 100;
  const n = PARETO.length;
  const pts: [number, number][] = [[0, h], ...PARETO.map((p, i): [number, number] => [((i + 1) / n) * w, h - p.cum * h])];
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
  const x80 = (n80 / n) * w;
  return (
    <div className="flex flex-col gap-4">
      <ParetoHead />
      <div className="m-in relative" style={at(1)}>
        <div className="m-draw">
          <svg aria-hidden className="w-full overflow-visible" viewBox={`0 0 ${w} ${h}`}>
            <defs>
              <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={ACCENT} stopOpacity="0.28" />
                <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
              </linearGradient>
            </defs>
            <line stroke="currentColor" strokeDasharray="3 4" strokeOpacity="0.25" x1="0" x2={w} y1={h * 0.2} y2={h * 0.2} />
            <line stroke="currentColor" strokeDasharray="3 4" strokeOpacity="0.25" x1={x80} x2={x80} y1={h * 0.2} y2={h} />
            <path d={`${d}L${w} ${h}L0 ${h}Z`} fill={`url(#${id})`} />
            <path d={d} fill="none" stroke={ACCENT} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" vectorEffect="non-scaling-stroke" />
            <circle cx={x80} cy={h * 0.2} fill="var(--background)" r="3.5" stroke={ACCENT} strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
        <span className="text-muted-foreground absolute -top-5 right-0 text-xs">100 %</span>
        <span className="text-muted-foreground absolute top-[18%] right-0 -translate-y-full text-xs">80 %</span>
        <div className="text-muted-foreground mt-1 flex justify-between text-xs">
          <span>клиентов: 0</span>
          <span>{n}</span>
        </div>
      </div>
      <div className="m-in grid grid-cols-3 gap-4 border-t pt-3" style={at(2)}>
        {classes.map((c) => (
          <div className="flex flex-col gap-0.5" key={c.cls}>
            <span className="flex items-center gap-1.5 text-xs">
              <span className="size-2 rounded-full" style={{ background: ACCENT, opacity: CLASS_OPACITY[c.cls] }} />
              Класс {c.cls}
            </span>
            <span className="text-sm font-medium tabular-nums">{c.count} клиентов</span>
            <span className="text-muted-foreground text-xs tabular-nums">{percent(c.share * 100, 0)} выручки</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const ParetoBars = () => {
  const top = PARETO[0]?.value ?? 1;
  return (
    <div className="flex flex-col gap-4">
      <ParetoHead />
      <ol className="flex flex-col">
        {PARETO.map((p, i) => {
          const next = PARETO[i + 1];
          return (
            <li className={cn("m-in grid grid-cols-[1.25rem_minmax(0,7.5rem)_1fr_3.25rem_2.75rem] items-center gap-2 py-[5px] text-sm", next && next.cls !== p.cls && "border-b border-dashed")} key={p.name} style={at(i + 1)}>
              <span className="text-muted-foreground text-xs">{p.cls}</span>
              <span className="truncate" title={p.name}>{p.name}</span>
              <span className="bg-muted h-1.5 overflow-hidden rounded-full">
                <span className="m-fill block h-full rounded-full" style={{ background: ACCENT, opacity: CLASS_OPACITY[p.cls], width: `${(p.value / top) * 100}%` }} />
              </span>
              <Tip className="text-muted-foreground text-right text-xs tabular-nums" tip={`${exactOf(p.value)} ₽`}>{short(p.value)}</Tip>
              <span className="text-right text-xs tabular-nums">{percent(p.cum * 100, 0)}</span>
            </li>
          );
        })}
      </ol>
      <p className="text-muted-foreground text-xs">Справа — нарастающая доля. Классы: A — до 80 %, B — до 95 %, C — остальные.</p>
    </div>
  );
};

// ═══ Выбросы ═════════════════════════════════════════════════════════════════════════════════════════════════════

const OutHead = () => (
  <Headline
    big={<>{OUTLIERS.length} из {exactOf(DOCS)}</>}
    note={`Порог — ${rub(FENCE)}: третий квартиль плюс полтора размаха между квартилями`}
    small="накладных заметно выше обычного"
  />
);

const outRows = OUTLIERS.slice(0, 5);

export const OutliersList = () => (
  <div className="flex flex-col gap-4">
    <OutHead />
    <ol className="flex flex-col gap-1.5">
      {outRows.map((r, i) => (
        <li className="m-in grid grid-cols-[minmax(0,8rem)_5rem_1fr_auto] items-center gap-2 text-sm" key={`${r.date}${r.client}${r.revenue}`} style={at(i + 1)}>
          <span className="truncate" title={r.client}>{r.client}</span>
          <span className="text-muted-foreground text-xs tabular-nums">{r.date.slice(8)}.{r.date.slice(5, 7)}.{r.date.slice(0, 4)}</span>
          <span />
          <Tip className="text-xs tabular-nums" tip={`${exactOf(r.revenue)} ₽ · в ${exactOf(Math.round((r.revenue / MEDIAN) * 10) / 10)} раза больше медианы`}>
            <span className="font-medium">{rub(r.revenue)}</span>
            <span className="text-muted-foreground"> · ×{Math.round(r.revenue / MEDIAN)}</span>
          </Tip>
        </li>
      ))}
    </ol>
    <p className="text-muted-foreground text-xs">Первые пять из {OUTLIERS.length}. Медиана — {rub(MEDIAN)}.</p>
  </div>
);

export const OutliersAxis = () => {
  const w = 400;
  const h = 64;
  const x = (v: number) => (v / MAX) * (w - 6) + 3;
  return (
    <div className="flex flex-col gap-4">
      <OutHead />
      <div className="m-in" style={at(1)}>
        <svg aria-hidden className="w-full overflow-visible" viewBox={`0 0 ${w} ${h}`}>
          {DOTS.map((d, i) => (
            <circle cx={x(d.value)} cy={6 + d.jitter * (h - 12)} fill={d.over ? "var(--chart-2)" : ACCENT} fillOpacity={d.over ? 0.9 : 0.28} key={i} r={d.over ? 2.3 : 1.8} />
          ))}
          <line stroke="currentColor" strokeDasharray="3 3" strokeOpacity="0.45" x1={x(FENCE)} x2={x(FENCE)} y1="0" y2={h} />
          <line stroke="currentColor" strokeOpacity="0.5" x1={x(MEDIAN)} x2={x(MEDIAN)} y1="0" y2={h} />
        </svg>
        <div className="text-muted-foreground relative mt-1 h-4 text-xs">
          <span className="absolute -translate-x-1/2" style={{ left: `${(MEDIAN / MAX) * 100}%` }}>медиана</span>
          <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(FENCE / MAX) * 100}%` }}>порог</span>
          <span className="absolute right-0">{short(MAX)}</span>
        </div>
      </div>
      <ol className="flex flex-col gap-1.5">
        {outRows.slice(0, 3).map((r, i) => (
          <li className="m-in flex items-baseline justify-between gap-3 text-sm" key={`${r.date}${r.client}${r.revenue}`} style={at(i + 2)}>
            <span className="truncate">{r.client} <span className="text-muted-foreground text-xs">{r.date.slice(8)}.{r.date.slice(5, 7)}</span></span>
            <span className="text-xs tabular-nums"><span className="font-medium">{rub(r.revenue)}</span><span className="text-muted-foreground"> · ×{Math.round(r.revenue / MEDIAN)}</span></span>
          </li>
        ))}
      </ol>
    </div>
  );
};

// ═══ Воронка ═════════════════════════════════════════════════════════════════════════════════════════════════════

const steps = FUNNEL.map((s, i) => ({ ...s, step: i === 0 ? null : s.count / (FUNNEL[i - 1]?.count ?? 1), whole: s.count / (FUNNEL[0]?.count ?? 1) }));
const worst = steps.reduce((w, s) => (s.step !== null && (w.step === null || s.step < w.step) ? s : w), steps[0] as (typeof steps)[number]);
const first = FUNNEL[0]?.count ?? 1;
const lastCount = FUNNEL.at(-1)?.count ?? 0;

const FunnelHead = () => (
  <Headline
    big={percent((lastCount / first) * 100)}
    note={`Больше всего теряем на стадии «${worst.name}»: проходит ${percent((worst.step ?? 0) * 100, 0)}`}
    small={`лидов доходит до оплаты (${exactOf(lastCount)} из ${exactOf(first)})`}
  />
);

export const FunnelCentered = () => (
  <div className="flex flex-col gap-4">
    <FunnelHead />
    <ol className="flex flex-col gap-1">
      {steps.map((s, i) => (
        <li key={s.name}>
          {s.step !== null && (
            <div className="m-in text-muted-foreground grid grid-cols-[7.5rem_1fr_3rem] items-center py-0.5 text-xs" style={at(i)}>
              <span />
              <span className="text-center tabular-nums" style={s === worst ? { color: BAD } : undefined}>↓ {percent(s.step * 100, 0)}</span>
              <span />
            </div>
          )}
          <div className="m-in grid grid-cols-[7.5rem_1fr_3rem] items-center gap-0 text-sm" style={at(i)}>
            <span className="truncate pr-2">{s.name}</span>
            <span className="flex justify-center">
              <span className="m-fill block h-7 rounded-md" style={{ background: ACCENT, opacity: 1 - i * 0.16, transformOrigin: "center", width: `${s.whole * 100}%` }} />
            </span>
            <span className="text-right text-xs tabular-nums">{exactOf(s.count)}</span>
          </div>
        </li>
      ))}
    </ol>
  </div>
);

export const FunnelStairs = () => (
  <div className="flex flex-col gap-4">
    <FunnelHead />
    <ol className="flex flex-col gap-2">
      {steps.map((s, i) => (
        <li className="m-in grid grid-cols-[7.5rem_1fr_3rem_3rem] items-center gap-2 text-sm" key={s.name} style={at(i + 1)}>
          <span className="truncate">{s.name}</span>
          <span className="bg-muted h-2 overflow-hidden rounded-full">
            <span className="m-fill block h-full rounded-full" style={{ background: ACCENT, opacity: 1 - i * 0.16, width: `${s.whole * 100}%` }} />
          </span>
          <span className="text-right text-xs tabular-nums">{exactOf(s.count)}</span>
          <Tip className="text-right text-xs tabular-nums" tip={s.step === null ? "Вход воронки" : `${percent(s.step * 100, 0)} от предыдущей стадии, ${percent(s.whole * 100)} от входа`}>
            {s.step === null ? <span className="text-muted-foreground">100 %</span> : <span style={{ color: s === worst ? BAD : undefined }}>{percent(s.step * 100, 0)}</span>}
          </Tip>
        </li>
      ))}
    </ol>
    <p className="text-muted-foreground text-xs">Справа — доля, прошедшая с прошлой стадии. Порядок стадий задаёт запрос или колонка с номером стадии.</p>
  </div>
);

// ═══ Состав ══════════════════════════════════════════════════════════════════════════════════════════════════════

const TONES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];
const toneOf = (i: number, rest?: boolean) => (rest ? "color-mix(in oklab, var(--muted-foreground) 45%, transparent)" : (TONES[i] as string));
const total = COMPOSITION.reduce((a, c) => a + c.value, 0);

const Legend = ({ hover, setHover }: { hover: number | null; setHover: (i: number | null) => void }) => (
  <ul className="flex max-w-md flex-col gap-1.5">
    {COMPOSITION.map((c, i) => (
      <li
        className="m-in grid grid-cols-[0.5rem_minmax(0,1fr)_auto_auto] items-center gap-2 text-sm transition-opacity duration-150"
        key={c.name}
        onPointerEnter={() => setHover(i)}
        onPointerLeave={() => setHover(null)}
        style={{ ...at(i + 1), opacity: hover === null || hover === i ? 1 : 0.45 }}
      >
        <span className="size-2 rounded-full" style={{ background: toneOf(i, c.rest) }} />
        <span className="truncate">{c.name}</span>
        <span className="text-muted-foreground text-xs tabular-nums">{short(c.value)}</span>
        <span className="w-10 text-right text-xs font-medium tabular-nums">{percent((c.value / total) * 100, 0)}</span>
      </li>
    ))}
  </ul>
);

export const CompositionDonut = () => {
  const [hover, setHover] = useState<number | null>(null);
  const r = 40;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="flex flex-col gap-5">
      <Headline big={percent((COMPOSITION[0]?.value ?? 0) / total * 100, 0)} note={`Выручка ${rub(total)} по клиентам`} small={`приходится на «${COMPOSITION[0]?.name}»`} />
      <div className="grid items-center gap-6 @md:grid-cols-[9rem_1fr]">
        <div className="m-in relative mx-auto size-36" style={at(1)}>
          <svg aria-hidden className="size-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" fill="none" r={r} stroke="var(--muted)" strokeWidth="12" />
            {COMPOSITION.map((s, i) => {
              const len = (s.value / total) * c;
              const el = (
                <circle
                  cx="50"
                  cy="50"
                  fill="none"
                  key={s.name}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                  r={r}
                  stroke={toneOf(i, s.rest)}
                  strokeDasharray={`${Math.max(len - 1.2, 0)} ${c}`}
                  strokeDashoffset={-acc}
                  strokeWidth={hover === i ? 14 : 12}
                  style={{ opacity: hover === null || hover === i ? 1 : 0.4, transition: "opacity 150ms ease, stroke-width 150ms ease" }}
                />
              );
              acc += len;
              return el;
            })}
          </svg>
          <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-base font-medium tabular-nums">{hover === null ? short(total) : percent(((COMPOSITION[hover]?.value ?? 0) / total) * 100, 0)}</span>
            <span className="text-muted-foreground max-w-20 truncate text-[11px]">{hover === null ? "всего, ₽" : COMPOSITION[hover]?.name}</span>
          </span>
        </div>
        <Legend hover={hover} setHover={setHover} />
      </div>
    </div>
  );
};

export const CompositionBar = () => {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="flex flex-col gap-5">
      <Headline big={percent((COMPOSITION[0]?.value ?? 0) / total * 100, 0)} note={`Выручка ${rub(total)} по клиентам`} small={`приходится на «${COMPOSITION[0]?.name}»`} />
      <div className="m-in flex h-3 gap-0.5" style={at(1)}>
        {COMPOSITION.map((s, i) => (
          <Tip className="block h-full first:[&>span]:rounded-s-full last:[&>span]:rounded-e-full" key={s.name} style={{ flexGrow: s.value, flexBasis: 0 }} tip={`${s.name} · ${exactOf(s.value)} ₽`}>
            <span
              className="m-fill block h-full transition-opacity duration-150"
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
              style={{ background: toneOf(i, s.rest), opacity: hover === null || hover === i ? 1 : 0.4 }}
            />
          </Tip>
        ))}
      </div>
      <Legend hover={hover} setHover={setHover} />
    </div>
  );
};
