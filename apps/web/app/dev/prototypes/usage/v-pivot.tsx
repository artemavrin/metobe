"use client";

import { cn } from "@metobe/ui/lib/utils";
import { useState } from "react";

import { daily, keyOf, labelOf, rank, totalsOf, valueOf } from "./agg";
import type { Group } from "./agg";
import type { Currency } from "./data";
import { useProto } from "./state";
import {
  compact,
  costLine,
  Delta,
  Empty,
  FilterChips,
  Frame,
  Header,
  isActive,
  MetricSwitch,
  MonthStepper,
  prevLabel,
  Segmented,
  TotalArea,
  UnpricedNote,
  useDrill,
  valueText,
  weekdayOf,
  whole,
} from "./ui";

// «Сводка» — a pivot of a BI tool: numbers in one line (no cards), the month's total by day over the same days of the
// month before, then the table «кто на чём»: people (or, for one's own, what for) by models, each cell tinted by its
// value, the totals at the edges; a click on a cell narrows the page to that pair. Last — the month as a calendar,
// tinted by day: the week's rhythm and the empty days at a glance.

const Stat = ({ label, value, now, prev }: { label: string; value: React.ReactNode; now: number; prev: number }) => (
  <div className="flex min-w-0 flex-col gap-0.5">
    <span className="text-muted-foreground text-xs">{label}</span>
    <span className="flex items-baseline gap-2">
      <span className="truncate text-lg font-semibold tracking-tight tabular-nums">{value}</span>
      <Delta now={now} prev={prev} />
    </span>
  </div>
);

/** A cell's tint: the theme's first color, as strong as the value is to the table's biggest. */
const tint = (v: number, max: number) => (v > 0 ? `color-mix(in oklab, var(--chart-1) ${Math.round(8 + (v / max) * 62)}%, transparent)` : undefined);

const Matrix = () => {
  const { rows, period, metric, currency, scope, filter, setFilter } = useProto();
  const drill = useDrill();
  const rowGroup: Group = scope === "team" ? "person" : "purpose";
  const lines = rank(rows, [], period.days, rowGroup, metric, currency);
  const cols = rank(rows, [], period.days, "model", metric, currency);
  const cell = new Map<string, number>();
  for (const r of rows) {
    const k = `${keyOf(r, rowGroup)}|${r.model}`;
    cell.set(k, (cell.get(k) ?? 0) + valueOf(r, metric, currency));
  }
  const max = Math.max(...cell.values(), 0) || 1;
  const short = (v: number) => (v === 0 ? "" : metric === "cost" ? valueText(metric, v, currency).replace(/\s?[$₽]/u, "") : compact(v));
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-xl border p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{scope === "team" ? "Кто на чём" : "На что и на чём"}</h2>
        <span className="text-muted-foreground text-xs">{metric === "cost" ? `в ${currency === "USD" ? "$" : "₽"}, ` : ""}клик по ячейке — только эта пара</span>
      </div>
      <div className="-mx-3 overflow-x-auto px-3 sm:-mx-4 sm:px-4">
        <table className="w-full border-separate border-spacing-0.5 text-sm">
          <thead>
            <tr>
              <th className="bg-background sticky left-0 z-10" />
              {cols.map((c) => (
                <th className="text-muted-foreground h-24 min-w-14 px-1 pb-1 align-bottom text-xs font-medium" key={c.key}>
                  <button className="hover:text-foreground mx-auto block max-h-24 truncate [writing-mode:vertical-rl] rotate-180" onClick={() => drill("model", c.key)} type="button">
                    {labelOf("model", c.key)}
                  </button>
                </th>
              ))}
              <th className="text-muted-foreground px-2 pb-1 text-right align-bottom text-xs font-medium">Всего</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key}>
                <th className="bg-background sticky left-0 z-10 max-w-36 pr-2 text-left font-normal">
                  <button className={cn("hover:text-foreground block w-full truncate text-left", isActive(filter, rowGroup, l.key) && "font-medium")} onClick={() => drill(rowGroup, l.key)} type="button">
                    {labelOf(rowGroup, l.key)}
                  </button>
                </th>
                {cols.map((c) => {
                  const v = cell.get(`${l.key}|${c.key}`) ?? 0;
                  return (
                    <td className="p-0" key={c.key}>
                      <button
                        className={cn("h-9 w-full min-w-14 rounded-md px-1 text-center text-xs tabular-nums transition-[filter] hover:brightness-95 disabled:cursor-default", v === 0 && "bg-muted/40")}
                        disabled={v === 0}
                        onClick={() => setFilter({ ...filter, [rowGroup]: rowGroup === "person" && l.key === "—" ? null : l.key, model: c.key })}
                        style={{ background: tint(v, max) }}
                        title={`${labelOf(rowGroup, l.key)} · ${labelOf("model", c.key)}: ${valueText(metric, v, currency)}`}
                        type="button"
                      >
                        {short(v)}
                      </button>
                    </td>
                  );
                })}
                <td className="px-2 text-right text-xs font-medium whitespace-nowrap tabular-nums">{valueText(metric, l.value, currency)}</td>
              </tr>
            ))}
            <tr>
              <th className="bg-background text-muted-foreground sticky left-0 z-10 pt-1 pr-2 text-left text-xs font-medium">Всего</th>
              {cols.map((c) => (
                <td className="pt-1 text-center text-xs font-medium whitespace-nowrap tabular-nums" key={c.key}>
                  {short(c.value)}
                </td>
              ))}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
};

const WEEK = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

const Calendar = () => {
  const { rows, period, metric, currency } = useProto();
  const values = daily(rows, period.days, metric, currency);
  const max = Math.max(...values, 0) || 1;
  const first = (new Date(`${period.from}T00:00:00Z`).getUTCDay() + 6) % 7;
  const lastDay = Number(new Date(Date.UTC(Number(period.from.slice(0, 4)), Number(period.from.slice(5, 7)), 0)).getUTCDate());
  const cells = [...Array.from({ length: first }, () => null), ...Array.from({ length: lastDay }, (_, i) => i)];
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-xl border p-3 sm:p-4">
      <h2 className="text-sm font-semibold">Календарь</h2>
      <div className="grid max-w-sm grid-cols-7 gap-1">
        {WEEK.map((d) => (
          <span className="text-muted-foreground text-center text-[11px]" key={d}>
            {d}
          </span>
        ))}
        {cells.map((i, n) => {
          if (i === null) return <span key={`e${n}`} />;
          const day = period.days[i];
          const v = values[i] ?? 0;
          return (
            <span
              className={cn("flex aspect-square flex-col items-center justify-center rounded-md text-[11px] tabular-nums", !day && "text-muted-foreground/40 border border-dashed", day && v === 0 && "bg-muted/40")}
              key={i}
              style={{ background: day ? tint(v, max) : undefined }}
              title={day ? `${i + 1}, ${weekdayOf(day)}: ${valueText(metric, v, currency)}` : "ещё впереди"}
            >
              {i + 1}
            </span>
          );
        })}
      </div>
    </section>
  );
};

export const Pivot = () => {
  const { rows, prevRows, period, metric, currency, present, scope } = useProto();
  const t = totalsOf(rows);
  const p = totalsOf(prevRows);
  const main = (present[0] ?? "USD") as Currency;
  const tokens = (x: typeof t) => x.input + x.output + x.cacheRead;
  const [cumulative, setCumulative] = useState(false);
  return (
    <Frame>
      <Header />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthStepper />
        <MetricSwitch size="sm" />
      </div>
      <FilterChips />
      {rows.length === 0 ? (
        <Empty />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:flex sm:flex-wrap sm:gap-x-10">
            <Stat label="Деньги" now={t.cost.get(main) ?? 0} prev={p.cost.get(main) ?? 0} value={costLine(t, present)} />
            <Stat label="Запросы" now={t.requests} prev={p.requests} value={whole(t.requests)} />
            <Stat label="Токены" now={tokens(t)} prev={tokens(p)} value={compact(tokens(t))} />
            {scope === "team" && <Stat label="Люди" now={t.people.size} prev={p.people.size} value={`${t.people.size} из 8`} />}
          </div>
          <section className="flex min-w-0 flex-col gap-2 rounded-xl border p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">{cumulative ? "С начала месяца" : "По дням"}</h2>
              <div className="flex items-center gap-3">
                {cumulative && <span className="text-muted-foreground text-xs max-sm:hidden">пунктир — {prevLabel(period.prev).slice(2)}</span>}
                <Segmented items={[["daily", "По дням"], ["running", "Накопленно"]]} onChange={(v) => setCumulative(v === "running")} size="sm" value={cumulative ? "running" : "daily"} />
              </div>
            </div>
            <TotalArea cumulative={cumulative} now={daily(rows, period.days, metric, currency)} prev={cumulative ? daily(prevRows, period.days.map((_, i) => `${period.prev.month}-${String(i + 1).padStart(2, "0")}`), metric, currency) : undefined} />
          </section>
          <Matrix />
          <Calendar />
          <UnpricedNote t={t} />
        </>
      )}
    </Frame>
  );
};
