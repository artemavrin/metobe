"use client";

import { Button } from "@metobe/ui/components/button";
import { cn } from "@metobe/ui/lib/utils";
import { useState } from "react";

import { daily, rank, totalsOf } from "./agg";
import type { Group, Metric } from "./agg";
import type { Currency } from "./data";
import { PeriodBar } from "./period-bar";
import { useProto } from "./state";
import {
  compact,
  Delta,
  Empty,
  FilterChips,
  Frame,
  GroupSwitch,
  GROUPS,
  Header,
  useNarrow,
  isActive,
  money,
  RankRow,
  Segmented,
  Spark,
  StackedDays,
  UnpricedNote,
  useDrill,
  whole,
} from "./ui";

// «Обзор» — the dashboard of OpenRouter's Activity, Langfuse and LiteLLM: four numbers on top, each with its days
// and its change against the same days of the month before; a tile is also the switch of what the chart shows.
// Below — the days stacked by models (people, purpose), then two rankings side by side. A click on a row, a bar's
// legend or a ranking narrows the whole page to it. Breakpoints are the page's width (container queries), not the
// window's: the phone frame on a wide screen lays out as a phone.

const Tile = ({ label, value, sub, now, prev, spark, active, onClick }: { label: string; value: React.ReactNode; sub?: React.ReactNode; now: number; prev: number; spark: number[]; active?: boolean; onClick?: () => void }) => {
  const Tag = onClick ? "button" : "div";
  // A phone: no sparkline — the four would repeat the chart below, and the tiles would take the whole first screen.
  const narrow = useNarrow();
  return (
    <Tag
      aria-pressed={onClick ? active : undefined}
      className={cn(
        "bg-card flex min-w-0 flex-col gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-[box-shadow,border-color] @xl:gap-1 @xl:p-4",
        onClick && "hover:border-foreground/20 cursor-pointer",
        active && "border-foreground/30 ring-foreground/10 ring-2 @max-xl:ring-1"
      )}
      onClick={onClick}
      type={onClick ? "button" : undefined}
    >
      <span className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
        {label}
        <Delta now={now} prev={prev} />
      </span>
      <span className="truncate text-lg font-semibold tracking-tight tabular-nums @xl:text-xl">{value}</span>
      {!narrow && <Spark bars className="h-7 w-full" values={spark} />}
      {sub && <span className="text-muted-foreground truncate text-xs">{sub}</span>}
    </Tag>
  );
};

const Ranking = ({ group, title, tabs }: { group: Group; title?: string; tabs?: React.ReactNode }) => {
  const { rows, prevRows, period, metric, currency, filter } = useProto();
  const narrow = useNarrow();
  const drill = useDrill();
  const [all, setAll] = useState(false);
  const list = rank(rows, prevRows, period.days, group, metric, currency);
  const shown = all ? list : list.slice(0, 6);
  return (
    <section className="@container flex min-w-0 flex-col gap-1 rounded-xl border p-2">
      {tabs ?? <h2 className="px-2 pt-1 pb-1 text-sm font-semibold">{title}</h2>}
      {shown.map((e, i) => (
        <RankRow active={isActive(filter, group, e.key)} dense={narrow} e={e} group={group} i={i} key={e.key} onClick={() => drill(group, e.key)} spark={!narrow} />
      ))}
      {list.length > 6 && (
        <Button className="self-start" onClick={() => setAll(!all)} size="sm" variant="ghost">
          {all ? "Свернуть" : `Ещё ${list.length - 6}`}
        </Button>
      )}
    </section>
  );
};

/** Two rankings side by side; on a phone — one card, the two as its tabs: two long lists one under the other bury the second. */
const Rankings = () => {
  const { scope } = useProto();
  const narrow = useNarrow();
  const second: Group = scope === "team" ? "person" : "purpose";
  const [tab, setTab] = useState<Group>("model");
  const shown = tab === "model" || tab === second ? tab : "model";
  if (narrow) {
    return (
      <Ranking
        group={shown}
        key={shown}
        tabs={
          <div className="px-1 pt-1 pb-1">
            <Segmented items={[["model", GROUPS.model], [second, GROUPS[second]]]} onChange={setTab} size="sm" value={shown} />
          </div>
        }
      />
    );
  }
  return (
    <div className="grid gap-3 @2xl:grid-cols-2">
      <Ranking group="model" title={GROUPS.model} />
      <Ranking group={second} title={GROUPS[second]} />
    </div>
  );
};

export const Overview = () => {
  const { rows, prevRows, period, metric, setMetric, currency, setCurrency, present, scope } = useProto();
  const narrow = useNarrow();
  const t = totalsOf(rows);
  const p = totalsOf(prevRows);
  const main = (present[0] ?? "USD") as Currency;
  const second = present[1];
  const tokens = (x: typeof t) => x.input + x.output + x.cacheRead;
  const days = (m: Metric, c: Currency = main) => daily(rows, period.days, m, c);
  return (
    <Frame>
      <Header />
      <PeriodBar />
      <FilterChips />
      {rows.length === 0 ? (
        <Empty />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 @xl:gap-3 @3xl:grid-cols-4">
            <Tile
              active={metric === "cost"}
              label="Деньги"
              now={t.cost.get(main) ?? 0}
              onClick={() => {
                setMetric("cost");
                setCurrency(main);
              }}
              prev={p.cost.get(main) ?? 0}
              spark={days("cost")}
              sub={second ? `и ${money(t.cost.get(second) ?? 0, second)}` : undefined}
              value={money(t.cost.get(main) ?? 0, main)}
            />
            <Tile active={metric === "requests"} label="Запросы" now={t.requests} onClick={() => setMetric("requests")} prev={p.requests} spark={days("requests")} sub={`ошибок ${((t.errors / t.requests) * 100).toFixed(1).replace(".", ",")}%`} value={whole(t.requests)} />
            <Tile active={metric === "tokens"} label="Токены" now={tokens(t)} onClick={() => setMetric("tokens")} prev={tokens(p)} spark={days("tokens")} sub={`из кеша ${Math.round((t.cacheRead / (t.input + t.cacheRead)) * 100)}% входа`} value={compact(tokens(t))} />
            {scope === "team" ? (
              <Tile label="Люди" now={t.people.size} prev={p.people.size} spark={days("requests")} sub={`≈ ${whole(t.requests / Math.max(t.people.size, 1))} запр. на человека`} value={`${t.people.size} из 8`} />
            ) : (
              <Tile
                label="Запрос в среднем"
                now={(t.cost.get(main) ?? 0) / Math.max(t.requests - t.unpriced, 1)}
                prev={(p.cost.get(main) ?? 0) / Math.max(p.requests - p.unpriced, 1)}
                spark={days("cost")}
                sub="только модели с ценой"
                value={money((t.cost.get(main) ?? 0) / Math.max(t.requests - t.unpriced, 1), main)}
              />
            )}
            {/* The comparison's days under the tiles, where the percentages are. */}
            <span className="text-muted-foreground col-span-2 -mt-0.5 text-xs @3xl:col-span-4">Изменения — {period.prevText}</span>
          </div>
          <section className="-mx-1 flex min-w-0 flex-col gap-3 @xl:mx-0 @xl:rounded-xl @xl:border @xl:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 @max-xl:px-1">
              {/* A phone: the grouping is the card's title — one row less. */}
              {narrow ? <GroupSwitch size="sm" /> : <h2 className="text-sm font-semibold">{period.hourly ? "По часам" : "По дням"}</h2>}
              <div className="flex flex-wrap items-center gap-2">
                {metric === "cost" && present.length > 1 && (
                  <Segmented items={present.map((c) => [c, c === "USD" ? "$" : "₽"] as [Currency, string])} onChange={setCurrency} size="sm" value={currency} />
                )}
                {!narrow && <GroupSwitch size="sm" />}
              </div>
            </div>
            <StackedDays height={narrow ? "h-52" : "h-64"} rows={rows} />
          </section>
          <Rankings />
          <UnpricedNote t={t} />
        </>
      )}
    </Frame>
  );
};
