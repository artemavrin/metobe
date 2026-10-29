"use client";

import { cn } from "@metobe/ui/lib/utils";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { daily, labelOf, rank, totalsOf, valueOf } from "./agg";
import type { Group } from "./agg";
import type { Currency } from "./data";
import { useProto } from "./state";
import {
  colorAt,
  dayLabel,
  Delta,
  Empty,
  Frame,
  GROUPS,
  Header,
  money,
  MetricSwitch,
  MonthStepper,
  OTHER,
  prevLabel,
  Segmented,
  Spark,
  TotalArea,
  UnpricedNote,
  valueText,
  weekdayOf,
} from "./ui";

// «Отчёт» — one column, read top to bottom, the same on a phone: the month's total as a big number with its change
// and its days; then one list at a time — models, people, days, what for. A row opens in place into the other side
// of it (a person — their models; a model — who uses it; a day — its models), nothing leaves the page.

type Tab = Group | "day";

/** The other side of an entry: a person → models, a model → people (or what for, for one's own), a purpose → models. */
const sideOf = (tab: Tab, team: boolean): Group => (tab === "model" ? (team ? "person" : "purpose") : "model");

const Breakdown = ({ tab, entry }: { tab: Tab; entry: string }) => {
  const { rows, period, metric, currency, scope } = useProto();
  const side = sideOf(tab, scope === "team");
  const own = rows.filter((r) => (tab === "day" ? r.day === entry : tab === "person" ? (r.user ?? "—") === entry : tab === "model" ? r.model === entry : r.purpose === entry));
  const list = rank(own, [], period.days, side, metric, currency);
  return (
    <div className="flex flex-col gap-1 pt-1 pb-2 pl-3">
      {list.map((e, i) => (
        <div className="flex items-center gap-2 text-sm" key={e.key}>
          <span className="size-2 shrink-0 rounded-full" style={{ background: i < 8 ? colorAt(i) : OTHER }} />
          <span className="min-w-0 flex-1 truncate">{labelOf(side, e.key)}</span>
          <span className="text-muted-foreground text-xs tabular-nums">{Math.round(e.share * 100)}%</span>
          <span className="w-20 text-right tabular-nums">{valueText(metric, e.value, currency)}</span>
        </div>
      ))}
    </div>
  );
};

const List = ({ tab }: { tab: Tab }) => {
  const { rows, prevRows, period, metric, currency } = useProto();
  const [open, setOpen] = useState<string | null>(null);
  if (tab === "day") {
    const values = daily(rows, period.days, metric, currency);
    const max = Math.max(...values, 0) || 1;
    const days = period.days.map((d, i) => ({ d, v: values[i] ?? 0 })).reverse();
    return (
      <div className="flex flex-col">
        {days.map(({ d, v }) => (
          <div key={d}>
            <button className="hover:bg-muted/60 flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors disabled:pointer-events-none" disabled={v === 0} onClick={() => setOpen(open === d ? null : d)} type="button">
              <span className="w-16 shrink-0 text-sm tabular-nums">{dayLabel(d)}</span>
              <span className={cn("w-6 shrink-0 text-xs", ["сб", "вс"].includes(weekdayOf(d)) ? "text-muted-foreground/60" : "text-muted-foreground")}>{weekdayOf(d)}</span>
              <span className="bg-muted relative h-2 flex-1 overflow-hidden rounded-full">
                <span className="absolute inset-y-0 left-0 rounded-full bg-[var(--chart-1)]" style={{ width: `${(v / max) * 100}%` }} />
              </span>
              <span className="w-20 shrink-0 text-right text-sm tabular-nums">{v === 0 ? "—" : valueText(metric, v, currency)}</span>
            </button>
            {open === d && <Breakdown entry={d} tab="day" />}
          </div>
        ))}
      </div>
    );
  }
  const list = rank(rows, prevRows, period.days, tab, metric, currency);
  return (
    <div className="flex flex-col">
      {list.map((e, i) => {
        const color = i < 8 ? colorAt(i) : OTHER;
        const isOpen = open === e.key;
        return (
          <div className={cn("rounded-lg transition-colors", isOpen && "bg-muted/50")} key={e.key}>
            <button aria-expanded={isOpen} className="hover:bg-muted/60 flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors" onClick={() => setOpen(isOpen ? null : e.key)} type="button">
              <span className="w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{i + 1}</span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate text-sm font-medium">{labelOf(tab, e.key)}</span>
                <span className="bg-muted relative h-1 overflow-hidden rounded-full">
                  <span className="absolute inset-y-0 left-0 rounded-full" style={{ background: color, width: `${Math.max(e.share * 100, 1)}%` }} />
                </span>
              </span>
              <Spark className="shrink-0 max-sm:w-14" color={color} values={e.spark} />
              <span className="flex w-20 shrink-0 flex-col items-end">
                <span className="text-sm font-medium tabular-nums">{valueText(metric, e.value, currency)}</span>
                <Delta now={e.value} prev={e.prev} />
              </span>
              <ChevronDown className={cn("text-muted-foreground size-4 shrink-0 transition-transform duration-200", isOpen && "rotate-180")} />
            </button>
            {isOpen && <Breakdown entry={e.key} tab={tab} />}
          </div>
        );
      })}
    </div>
  );
};

export const Report = () => {
  const { rows, prevRows, period, metric, currency, scope } = useProto();
  const [tab, setTab] = useState<Tab>("model");
  const t = totalsOf(rows);
  const now = rows.reduce((s, r) => s + valueOf(r, metric, currency), 0);
  const prev = prevRows.reduce((s, r) => s + valueOf(r, metric, currency), 0);
  const other = [...t.cost.keys()].find((c) => c !== currency) as Currency | undefined;
  const tabs: [Tab, string][] = [["model", GROUPS.model], ...(scope === "team" ? ([["person", GROUPS.person]] as [Tab, string][]) : []), ["day", "Дни"], ["purpose", scope === "team" ? "На что" : GROUPS.purpose]];
  const shown = scope === "me" && tab === "person" ? "model" : tab;
  return (
    <Frame>
      <Header />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthStepper />
        <MetricSwitch size="sm" />
      </div>
      {rows.length === 0 ? (
        <Empty />
      ) : (
        <>
          <section className="flex flex-col gap-1">
            <span className="text-4xl font-semibold tracking-tight tabular-nums">{valueText(metric, now, currency)}</span>
            <span className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-sm">
              {metric === "cost" && other && <span>и {money(t.cost.get(other) ?? 0, other)} отдельно</span>}
              <span className="inline-flex items-center gap-1">
                <Delta className="text-sm" now={now} prev={prev} /> {prev > 0 && prevLabel(period.prev)}
              </span>
            </span>
            <TotalArea cumulative height="h-40 mt-2" now={daily(rows, period.days, metric, currency)} prev={daily(prevRows, period.days.map((_, i) => `${period.prev.month}-${String(i + 1).padStart(2, "0")}`), metric, currency)} />
            <UnpricedNote t={t} />
          </section>
          <section className="flex flex-col gap-2">
            <Segmented items={tabs} onChange={setTab} value={shown} />
            <List key={shown} tab={shown} />
          </section>
        </>
      )}
    </Frame>
  );
};
