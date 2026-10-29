"use client";

import { EChartsLineChart } from "@metobe/ui/components/evilcharts/charts/echarts-line-chart";
import type { ChartConfig } from "@metobe/ui/components/evilcharts/ui/echarts-chart";
import { Input } from "@metobe/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@metobe/ui/components/select";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowDown, ArrowUp, CalendarDays, ChevronDown, ChevronRight, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { daily, keyOf, labelOf, matches, noteOf, totalsOf, within } from "./agg";
import type { Group } from "./agg";
import { daysBetween, MODELS, PEOPLE, TODAY } from "./data";
import type { Currency, Row } from "./data";
import { useProto } from "./state";
import { colorAt, compact, dayLabel, Delta, Empty, Frame, money, OTHER, Segmented, Spark, useNarrow, weekdayOf, whole } from "./ui";

// «Vercel» — by the AI Gateway's Usage and Requests (vercel.com/docs/ai-gateway/observability-and-spend/observability):
// on top only the filters — who, which model — and the period, each a plain dropdown; then four equal cards, each one
// measure with its total under the title and a line per model, the title itself the dropdown of what the lines are
// (models, people, purpose); no legends — the tooltip names them. Below — the table: people or models, the numbers in
// columns, the time to the first token with a bar in the cell and its days, sorted by any column; a row's chevron
// narrows the whole page to it, the dropdowns on top show it and lift it.

type Range = "7d" | "30d" | "month" | "prev" | "90d";
const RANGES: Record<Range, string> = { "30d": "Последние 30 дней", "7d": "Последние 7 дней", "90d": "Последние 90 дней", month: "Этот месяц", prev: "Прошлый месяц" };

const shiftDay = (d: string, by: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + by);
  return x.toISOString().slice(0, 10);
};

/** The range's days and as many days before them. */
const rangeOf = (r: Range) => {
  let from: string;
  let to = TODAY;
  if (r === "month") from = `${TODAY.slice(0, 7)}-01`;
  else if (r === "prev") {
    to = shiftDay(`${TODAY.slice(0, 7)}-01`, -1);
    from = `${to.slice(0, 7)}-01`;
  } else from = shiftDay(TODAY, -(Number.parseInt(r, 10) - 1));
  const days = daysBetween(from, to);
  return { days, from, prev: { from: shiftDay(from, -days.length), to: shiftDay(from, -1) }, to };
};

const SYMBOL: Record<Currency, string> = { RUB: "₽", USD: "$" };

/** What a card measures: a value per row, and how a total of it is put together (a sum, or a mean by requests). */
type Measure = "cost" | "requests" | "tokens" | "latency";
const measure = (r: Row, m: Measure, c: Currency) => {
  if (m === "latency") return r.latency * r.requests;
  if (m === "cost") return r.currency === c && r.cost !== null ? r.cost : 0;
  if (m === "tokens") return r.input + r.output + r.cacheRead;
  return r.requests;
};
const seconds = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(2).replace(".", ",")} с` : `${Math.round(ms)} мс`);
const text = (m: Measure, v: number, c: Currency) => (m === "cost" ? money(v, c) : m === "latency" ? seconds(v) : m === "tokens" ? compact(v) : whole(v));

/** The days of each of the top five of a grouping (the rest — «Прочее»), and the total of the measure. */
const linesOf = (rows: Row[], days: string[], group: Group, m: Measure, c: Currency) => {
  const by = new Map<string, Row[]>();
  for (const r of rows) by.set(keyOf(r, group), [...(by.get(keyOf(r, group)) ?? []), r]);
  const sum = (list: Row[]) => list.reduce((s, r) => s + measure(r, m, c), 0);
  const reqs = (list: Row[]) => list.reduce((s, r) => s + r.requests, 0);
  const ranked = [...by].map(([k, list]) => ({ k, list, v: sum(list) })).filter((e) => e.v > 0).sort((a, b) => b.v - a.v);
  const top = ranked.slice(0, 5);
  const rest = ranked.slice(5).flatMap((e) => e.list);
  const series = [...top.map((e) => ({ key: e.k, list: e.list })), ...(rest.length ? [{ key: "other", list: rest }] : [])];
  const index = new Map(days.map((d, i) => [d, i]));
  const data = days.map((day) => ({ day }) as Record<string, number | string>);
  for (const s of series) {
    const v = days.map(() => 0);
    const n = days.map(() => 0);
    for (const r of s.list) {
      const i = index.get(r.day);
      if (i === undefined) continue;
      v[i] = (v[i] ?? 0) + measure(r, m, c);
      n[i] = (n[i] ?? 0) + r.requests;
    }
    days.forEach((_, i) => {
      const point = data[i] as Record<string, number | string>;
      // The time to the first token is a mean by requests; a day without requests has none — not zero.
      point[s.key] = m === "latency" ? ((n[i] ?? 0) > 0 ? (v[i] ?? 0) / (n[i] ?? 1) : (null as unknown as number)) : (v[i] ?? 0);
    });
  }
  const total = m === "latency" ? sum(rows) / Math.max(reqs(rows), 1) : sum(rows);
  return { data, series: series.map((s) => s.key), total };
};

const GROUP_TITLE: Record<Measure, Record<Group, string>> = {
  cost: { model: "Расход по моделям", person: "Расход по людям", purpose: "Расход по назначению" },
  latency: { model: "Первый токен по моделям", person: "Первый токен по людям", purpose: "Первый токен по назначению" },
  requests: { model: "Запросы по моделям", person: "Запросы по людям", purpose: "Запросы по назначению" },
  tokens: { model: "Токены по моделям", person: "Токены по людям", purpose: "Токены по назначению" },
};

/** A Vercel select: a plain bordered box, its value, a chevron. */
const Pick = <T extends string>({ value, onChange, items, icon, className }: { value: T; onChange: (v: T) => void; items: [T, string][]; icon?: React.ReactNode; className?: string }) => (
  <Select onValueChange={(v) => onChange(v as T)} value={value}>
    <SelectTrigger className={cn("bg-background h-9 gap-2", className)}>
      {icon}
      <SelectValue>{items.find(([v]) => v === value)?.[1]}</SelectValue>
    </SelectTrigger>
    <SelectContent className="max-h-80">
      {items.map(([v, label]) => (
        <SelectItem key={v} value={v}>
          {label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

/** The card's title is the dropdown of what its lines are. */
const TitlePick = ({ m, group, onChange, groups }: { m: Measure; group: Group; onChange: (g: Group) => void; groups: Group[] }) => (
  <Select onValueChange={(v) => onChange(v as Group)} value={group}>
    <SelectTrigger className="text-muted-foreground hover:text-foreground h-auto gap-1 border-0 bg-transparent p-0 text-sm shadow-none dark:bg-transparent [&>svg:last-child]:hidden">
      <SelectValue>{GROUP_TITLE[m][group]}</SelectValue>
      <ChevronDown className="size-3.5" />
    </SelectTrigger>
    <SelectContent>
      {groups.map((g) => (
        <SelectItem key={g} value={g}>
          {GROUP_TITLE[m][g]}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

const ChartCard = ({ m, rows, prevRows, days, extra }: { m: Measure; rows: Row[]; prevRows: Row[]; days: string[]; extra?: React.ReactNode }) => {
  const { scope, currency } = useProto();
  const narrow = useNarrow();
  const groups: Group[] = scope === "team" ? ["model", "person", "purpose"] : ["model", "purpose"];
  const [group, setGroup] = useState<Group>("model");
  const g = groups.includes(group) ? group : "model";
  const { data, series, total } = linesOf(rows, days, g, m, currency);
  const before = linesOf(prevRows, days, g, m, currency).total;
  const config: ChartConfig = Object.fromEntries(series.map((k, i) => [k, { colors: { dark: [k === "other" ? OTHER : colorAt(i)], light: [k === "other" ? OTHER : colorAt(i)] }, label: k === "other" ? "Прочее" : labelOf(g, k) }]));
  const last = days.length - 1;
  return (
    <section className="bg-background flex min-w-0 flex-col gap-1 rounded-xl border px-4 pt-4 pb-4 sm:px-5 sm:pt-5">
      <div className="flex items-start justify-between gap-2">
        <TitlePick groups={groups} group={g} m={m} onChange={setGroup} />
        {extra}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-semibold tracking-tight tabular-nums">{text(m, total, currency)}</span>
        <Delta now={total} prev={before} />
      </div>
      <div className={cn("-mx-1 min-w-0", narrow ? "h-40" : "h-48")}>
        {series.length === 0 ? (
          <p className="text-muted-foreground flex h-full items-center justify-center text-sm">Нет данных за период</p>
        ) : (
          <EChartsLineChart className="h-full" config={config} curveType="linear" data={data} enableHoverHighlight key={`${g}-${currency}-${series.join()}-${days.length}`} xDataKey="day">
            {series.map((k) => (
              <EChartsLineChart.Line dataKey={k} key={k} strokeWidth={1.75} />
            ))}
            <EChartsLineChart.Grid />
            <EChartsLineChart.XAxis dataKey="day" hideDots tickFormatter={() => ""} />
            <EChartsLineChart.YAxis hideDots tickFormatter={(v) => (m === "cost" ? money(v, currency).replace(",00", "") : m === "latency" ? seconds(v) : compact(v))} />
            <EChartsLineChart.Tooltip labelFormatter={(l) => `${dayLabel(l)}, ${weekdayOf(l)}`} valueFormatter={(v) => text(m, v, currency)} />
          </EChartsLineChart>
        )}
      </div>
      {/* Like Vercel's «1h ago … Just now»: only the ends of the period, under the chart. */}
      <div className="text-muted-foreground -mt-3 flex justify-between pl-10 text-xs">
        <span>{dayLabel(days[0] ?? TODAY)}</span>
        <span>{days[last] === TODAY ? "сегодня" : dayLabel(days[last] ?? TODAY)}</span>
      </div>
    </section>
  );
};

type Col = "requests" | "tokens" | "latency" | "errors" | "cost";

interface Line {
  key: string;
  requests: number;
  tokens: number;
  latency: number;
  latencyDays: number[];
  errors: number;
  cost: number;
  prevCost: number;
}

const Table = ({ rows, prevRows, days }: { rows: Row[]; prevRows: Row[]; days: string[] }) => {
  const { scope, currency, filter, setFilter } = useProto();
  const tabs: [Group, string][] = scope === "team" ? [["person", "Люди"], ["model", "Модели"], ["purpose", "Назначение"]] : [["model", "Модели"], ["purpose", "Назначение"]];
  const [tab, setTab] = useState<Group>(scope === "team" ? "person" : "model");
  const g = tabs.some(([t]) => t === tab) ? tab : (tabs[0]?.[0] as Group);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ col: Col; desc: boolean }>({ col: "cost", desc: true });
  const lines = useMemo(() => {
    const by = new Map<string, Row[]>();
    for (const r of rows) by.set(keyOf(r, g), [...(by.get(keyOf(r, g)) ?? []), r]);
    const prev = new Map<string, number>();
    for (const r of prevRows) prev.set(keyOf(r, g), (prev.get(keyOf(r, g)) ?? 0) + measure(r, "cost", currency));
    return [...by].map(([key, list]): Line => {
      const t = totalsOf(list);
      const lat = days.map((d) => {
        const day = list.filter((r) => r.day === d);
        const n = day.reduce((s, r) => s + r.requests, 0);
        return n ? day.reduce((s, r) => s + r.latency * r.requests, 0) / n : 0;
      });
      return {
        cost: t.cost.get(currency) ?? 0,
        errors: t.errors,
        key,
        latency: list.reduce((s, r) => s + r.latency * r.requests, 0) / Math.max(t.requests, 1),
        latencyDays: lat,
        prevCost: prev.get(key) ?? 0,
        requests: t.requests,
        tokens: t.input + t.output + t.cacheRead,
      };
    });
  }, [rows, prevRows, g, currency, days]);
  const shown = lines
    .filter((l) => !query || labelOf(g, l.key).toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => (sort.desc ? b[sort.col] - a[sort.col] : a[sort.col] - b[sort.col]));
  const maxLatency = Math.max(...lines.map((l) => l.latency), 1);
  const head = (col: Col, label: string, className?: string) => (
    <th className={cn("px-3 py-2.5 text-right font-normal whitespace-nowrap", className)}>
      <button className="hover:text-foreground inline-flex items-center gap-1" onClick={() => setSort({ col, desc: sort.col === col ? !sort.desc : true })} type="button">
        {label}
        {sort.col === col && (sort.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
      </button>
    </th>
  );
  const open = (key: string) => setFilter({ ...filter, [g]: g === "person" && key === "—" ? null : key });
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-semibold tracking-tight">Подробно</h2>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented items={tabs} onChange={setTab} value={g} />
        <div className="relative min-w-40 flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input className="bg-background h-9 pl-9" onChange={(e) => setQuery(e.target.value)} placeholder="Поиск…" value={query} />
        </div>
      </div>
      <div className="bg-background overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left">
              <th className="px-4 py-2.5 font-normal">{g === "person" ? "Человек" : g === "model" ? "Модель" : "Назначение"}</th>
              {head("requests", "Запросы")}
              {head("tokens", "Токены")}
              {head("latency", "Первый токен", "text-left")}
              {head("errors", "Ошибки")}
              {head("cost", `Расход, ${SYMBOL[currency]}`)}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {shown.map((l) => (
              <tr className="hover:bg-muted/40 group cursor-pointer border-b last:border-0" key={l.key} onClick={() => open(l.key)}>
                <td className="px-4 py-3">
                  <span className="flex flex-col">
                    <span className={cn("font-medium", l.key === "—" && "text-muted-foreground font-normal")}>{labelOf(g, l.key)}</span>
                    {noteOf(g, l.key) && <span className="text-muted-foreground text-xs">{noteOf(g, l.key)}</span>}
                  </span>
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{compact(l.requests)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{compact(l.tokens)}</td>
                <td className="px-3 py-3">
                  <span className="flex items-center gap-3">
                    <span className="relative w-20 shrink-0 rounded px-1.5 py-0.5 tabular-nums">
                      <span className="bg-muted absolute inset-y-0 left-0 rounded" style={{ width: `${(l.latency / maxLatency) * 100}%` }} />
                      <span className="relative">{seconds(l.latency)}</span>
                    </span>
                    <Spark className="h-5 w-14 max-md:hidden" color="var(--muted-foreground)" values={l.latencyDays} />
                  </span>
                </td>
                <td className={cn("px-3 py-3 text-right tabular-nums", l.errors === 0 && "text-muted-foreground")}>{l.errors === 0 ? "—" : whole(l.errors)}</td>
                <td className="px-3 py-3 text-right">
                  <span className="flex flex-col items-end">
                    <span className="font-medium tabular-nums">{l.cost > 0 ? money(l.cost, currency) : "—"}</span>
                    <Delta now={l.cost} prev={l.prevCost} />
                  </span>
                </td>
                <td className="text-muted-foreground pr-3">
                  <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export const Vercel = () => {
  const { base, filter, setFilter, scope, currency, setCurrency, present, screen } = useProto();
  const narrow = useNarrow();
  const [range, setRange] = useState<Range>("30d");
  const r = useMemo(() => rangeOf(range), [range]);
  const rows = useMemo(() => within(base, r.from, r.to).filter((x) => matches(x, filter)), [base, r, filter]);
  const prevRows = useMemo(() => within(base, r.prev.from, r.prev.to).filter((x) => matches(x, filter)), [base, r, filter]);
  const t = totalsOf(rows);
  const other = present.find((c) => c !== currency);
  const personValue = filter.person === undefined ? "all" : (filter.person ?? "—");
  const set = (k: "person" | "model", v: string) => {
    const next = { ...filter };
    if (v === "all") delete next[k];
    else if (k === "person") next.person = v === "—" ? null : v;
    else next.model = v;
    setFilter(next);
  };
  // The money card's corner: the other currency's total, and the switch between the two — never one sum.
  const currencyCorner =
    present.length > 1 ? (
      <span className="flex items-center gap-0.5 text-xs">
        {present.map((c) => (
          <button className={cn("rounded px-1.5 py-0.5 transition-colors", c === currency ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")} key={c} onClick={() => setCurrency(c)} type="button">
            {SYMBOL[c]}
          </button>
        ))}
      </span>
    ) : undefined;
  const body = (
    <>
        <h1 className="text-2xl font-semibold tracking-tight">{scope === "team" ? "Расходы команды" : "Расходы"}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {scope === "team" && (
            <Pick
              className="w-44"
              items={[["all", "Все люди"], ...PEOPLE.map((p) => [p.id, p.name] as [string, string]), ["—", "Без пользователя"]]}
              onChange={(v) => set("person", v)}
              value={personValue}
            />
          )}
          <Pick className="w-48" items={[["all", "Все модели"], ...MODELS.filter((m) => present.length > 1 || m.price?.currency !== "RUB").map((m) => [m.id, m.title] as [string, string])]} onChange={(v) => set("model", v)} value={filter.model ?? "all"} />
          <Pick className="w-52 sm:ml-auto" icon={<CalendarDays className="text-muted-foreground size-4" />} items={Object.entries(RANGES) as [Range, string][]} onChange={setRange} value={range} />
        </div>
        {rows.length === 0 ? (
          <Empty />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <ChartCard
                days={r.days}
                extra={
                  <span className="flex items-center gap-2">
                    {other && <span className="text-muted-foreground text-xs tabular-nums max-sm:hidden">и {money(t.cost.get(other) ?? 0, other)}</span>}
                    {currencyCorner}
                  </span>
                }
                m="cost"
                prevRows={prevRows}
                rows={rows}
              />
              <ChartCard days={r.days} m="requests" prevRows={prevRows} rows={rows} />
              <ChartCard days={r.days} m="tokens" prevRows={prevRows} rows={rows} />
              <ChartCard days={r.days} m="latency" prevRows={prevRows} rows={rows} />
            </div>
            {t.unpriced > 0 && <p className="text-muted-foreground -mt-2 text-xs">{whole(t.unpriced)} запр. — модели без цены: в запросах и токенах есть, в расходе нет.</p>}
            <Table days={r.days} prevRows={prevRows} rows={rows} />
          </>
        )}
    </>
  );
  // A phone: the same page in the prototype's narrow frame; a computer — Vercel's grey page with white cards.
  if (screen === "phone") return <Frame>{body}</Frame>;
  return (
    <div className={cn("bg-muted/40 min-h-dvh", narrow && "bg-transparent")}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 pt-6 pb-32 md:px-8 md:pt-10">{body}</div>
    </div>
  );
};
