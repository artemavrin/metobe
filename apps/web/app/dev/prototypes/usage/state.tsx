"use client";

import { cn } from "@metobe/ui/lib/utils";
import { createContext, use, useEffect, useMemo, useState } from "react";

import { currenciesOf, matches, within } from "./agg";
import type { Filter, Group, Metric, Month } from "./agg";
import { ME, ROWS, TODAY } from "./data";
import { NOW_HOUR, periodOf, toHours } from "./period";
import type { Period, Span } from "./period";
import type { Currency, Row } from "./data";

// The page's own controls (month, metric, currency, grouping, the drill-down filter) and the prototype's knobs:
// whose usage — an admin's whole team or one person's own (the «Расходы» every user has), one currency or two, an
// empty month, desktop or phone. `?sc=me&cur=one&st=empty&sz=phone` — a state to send to someone.

export type Scope = "team" | "me";
export type Currencies = "one" | "two";
export type Screen = "desktop" | "phone";

interface Ctx {
  scope: Scope;
  setScope: (s: Scope) => void;
  currencies: Currencies;
  setCurrencies: (c: Currencies) => void;
  empty: boolean;
  setEmpty: (e: boolean) => void;
  screen: Screen;
  setScreen: (s: Screen) => void;
  month: Month;
  setMonth: (m: Month) => void;
  /** Day, week, month or a range from the calendar; the anchor is a day inside the period. */
  span: Span;
  anchor: string;
  custom: { from: string; to: string } | undefined;
  setPeriod: (span: Span, anchor: string, custom?: { from: string; to: string }) => void;
  metric: Metric;
  setMetric: (m: Metric) => void;
  currency: Currency;
  setCurrency: (c: Currency) => void;
  group: Group;
  setGroup: (g: Group) => void;
  filter: Filter;
  setFilter: (f: Filter) => void;
  /** Rows of the scope and the knobs, before the month and the filter. */
  base: Row[];
  period: Period;
  /** The month's rows and the same days of the month before, filtered. */
  rows: Row[];
  prevRows: Row[];
  /** Currencies the month has, the one with more spent first. */
  present: Currency[];
}

const Proto = createContext<Ctx>(null as never);

export const ProtoProvider = ({ children }: { children: React.ReactNode }) => {
  const [scope, setScope] = useState<Scope>("team");
  const [currencies, setCurrencies] = useState<Currencies>("two");
  const [empty, setEmpty] = useState(false);
  const [screen, setScreen] = useState<Screen>("desktop");
  const [span, setSpan] = useState<Span>("month");
  const [anchor, setAnchor] = useState(TODAY);
  const [custom, setCustom] = useState<{ from: string; to: string } | undefined>();
  const setPeriod = (s: Span, a: string, c?: { from: string; to: string }) => {
    setSpan(s);
    setAnchor(a);
    setCustom(c);
  };
  // The first round's variants step months only.
  const month = anchor.slice(0, 7) as Month;
  const setMonth = (m: Month) => setPeriod("month", m === TODAY.slice(0, 7) ? TODAY : `${m}-01`);
  const [metric, setMetric] = useState<Metric>("cost");
  const [currency, setCurrency] = useState<Currency>("USD");
  const [group, setGroup] = useState<Group>("model");
  const [filter, setFilter] = useState<Filter>({});
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("sc") === "me") setScope("me");
    if (q.get("cur") === "one") setCurrencies("one");
    if (q.get("st") === "empty") setEmpty(true);
    if (q.get("sz") === "phone") setScreen("phone");
  }, []);
  // A person sees only their own; «по людям» has nothing to group then.
  useEffect(() => {
    setFilter({});
    if (scope === "me") setGroup((g) => (g === "person" ? "model" : g));
  }, [scope]);
  const base = useMemo(() => {
    if (empty) return [];
    let list = scope === "me" ? ROWS.filter((r) => r.user === ME) : ROWS;
    if (currencies === "one") list = list.filter((r) => r.currency !== "RUB");
    return list;
  }, [scope, currencies, empty]);
  const period = useMemo(() => periodOf(span, anchor, custom), [span, anchor, custom]);
  // A single day is drawn by hours.
  const rows = useMemo(() => {
    const list = within(base, period.from, period.to).filter((r) => matches(r, filter));
    return period.hourly ? toHours(list) : list;
  }, [base, period, filter]);
  // Today so far against yesterday up to the same hour, not the whole of it.
  const prevRows = useMemo(() => {
    const list = within(base, period.prev.from, period.prev.to).filter((r) => matches(r, filter));
    return period.hourly && period.from === TODAY ? toHours(list, NOW_HOUR) : list;
  }, [base, period, filter]);
  const present = useMemo(() => currenciesOf(within(base, period.from, period.to)), [base, period]);
  useEffect(() => {
    if (present.length > 0 && !present.includes(currency)) setCurrency(present[0] as Currency);
  }, [present, currency]);
  return (
    <Proto
      value={{ anchor, base, currencies, currency, custom, empty, filter, group, metric, month, period, present, prevRows, rows, scope, screen, setCurrencies, setCurrency, setEmpty, setFilter, setGroup, setMetric, setMonth, setPeriod, setScope, setScreen, span }}
    >
      {children}
    </Proto>
  );
};

export const useProto = () => use(Proto);

const Chip = ({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) => (
  <button
    aria-pressed={active}
    className={cn("rounded-full px-2.5 py-1 transition-colors duration-150", active ? "bg-white/15 text-white" : "text-white/55 hover:text-white/85")}
    onClick={onClick}
    type="button"
  >
    {children}
  </button>
);

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-4">
    <span>{label}</span>
    <div className="flex gap-1">{children}</div>
  </div>
);

export const ProtoParams = () => {
  const { scope, setScope, currencies, setCurrencies, empty, setEmpty, screen, setScreen } = useProto();
  return (
    <>
      <Row label="чьи">
        <Chip active={scope === "team"} onClick={() => setScope("team")}>
          команда (админ)
        </Chip>
        <Chip active={scope === "me"} onClick={() => setScope("me")}>
          мои
        </Chip>
      </Row>
      <Row label="валюты">
        <Chip active={currencies === "two"} onClick={() => setCurrencies("two")}>
          $ и ₽
        </Chip>
        <Chip active={currencies === "one"} onClick={() => setCurrencies("one")}>
          только $
        </Chip>
      </Row>
      <Row label="данные">
        <Chip active={!empty} onClick={() => setEmpty(false)}>
          есть
        </Chip>
        <Chip active={empty} onClick={() => setEmpty(true)}>
          пусто
        </Chip>
      </Row>
      <Row label="экран">
        <Chip active={screen === "desktop"} onClick={() => setScreen("desktop")}>
          компьютер
        </Chip>
        <Chip active={screen === "phone"} onClick={() => setScreen("phone")}>
          телефон
        </Chip>
      </Row>
    </>
  );
};
