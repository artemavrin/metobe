import { daysBetween, TODAY } from "./data";
import type { Row } from "./data";

// The period the page shows: a day, a week (Monday to Sunday), a month — each stepped with ‹ › — or any range picked on
// the calendar. Its buckets are the chart's x: days, or hours for a single day. The comparison is the period just
// before, as many days long: a week in progress against the same days of the last one.

export type Span = "day" | "week" | "month" | "custom";

export interface Period {
  span: Span;
  from: string;
  to: string;
  /** The chart's buckets: days, or `2026-10-29T09` hours for a single day. */
  days: string[];
  hourly: boolean;
  /** The period runs into today: its end is not here yet. */
  partial: boolean;
  prev: { from: string; to: string; month: string };
  label: string;
  /** «к 1–29 сентября». */
  prevText: string;
  /** No ‹ › past today. */
  canNext: boolean;
}

export const shiftDay = (d: string, by: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + by);
  return x.toISOString().slice(0, 10);
};
const shiftMonth = (d: string, by: number) => {
  const [y, m] = d.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 10);
};
const monthEnd = (d: string) => shiftDay(shiftMonth(d, 1), -1);
const weekStart = (d: string) => shiftDay(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));
const min = (a: string, b: string) => (a < b ? a : b);
const date = (d: string) => new Date(`${d}T00:00:00Z`);

const DAY_MONTH = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });
const DAY_MON = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
const MONTH_YEAR = new Intl.DateTimeFormat("ru-RU", { month: "long", timeZone: "UTC", year: "numeric" });
const short = (d: string) => DAY_MON.format(date(d)).replace(".", "");

/** «3–17 окт», «28 сент – 5 окт», «29 октября». */
export const rangeText = (from: string, to: string, long = false) => {
  if (from === to) return DAY_MONTH.format(date(from));
  if (from.slice(0, 7) === to.slice(0, 7)) {
    const tail = long ? DAY_MONTH.format(date(to)) : short(to);
    return `${Number(from.slice(8))}–${tail}`;
  }
  return `${short(from)} – ${short(to)}`;
};

export const periodOf = (span: Span, anchor: string, custom?: { from: string; to: string }): Period => {
  let from: string;
  let end: string;
  if (span === "day") from = end = anchor;
  else if (span === "week") {
    from = weekStart(anchor);
    end = shiftDay(from, 6);
  } else if (span === "month") {
    from = `${anchor.slice(0, 7)}-01`;
    end = monthEnd(from);
  } else {
    from = custom?.from ?? anchor;
    end = custom?.to ?? anchor;
  }
  const to = min(end, TODAY);
  const days = daysBetween(from, to);
  // The same days of the period before: a month or a week so far — as many of its first days; a range — the days
  // just before it.
  let prevFrom = shiftDay(from, -days.length);
  if (span === "month") prevFrom = shiftMonth(from, -1);
  if (span === "week") prevFrom = shiftDay(from, -7);
  const prevTo = min(shiftDay(prevFrom, days.length - 1), shiftDay(from, -1));
  const prev = { from: prevFrom, month: prevFrom.slice(0, 7), to: prevTo };
  let label: string;
  if (span === "day") label = from === TODAY ? "Сегодня" : from === shiftDay(TODAY, -1) ? "Вчера" : DAY_MONTH.format(date(from));
  else if (span === "month") label = MONTH_YEAR.format(date(from)).replace(" г.", "");
  else label = rangeText(from, span === "week" ? end : to);
  let prevText: string;
  if (span === "day") prevText = from === TODAY ? `к вчерашнему дню до ${NOW_HOUR + 1}:00` : prev.from === shiftDay(TODAY, -1) ? "к вчерашнему дню" : `к ${DAY_MONTH.format(date(prev.from))}`;
  else if (span === "week" && end === to) prevText = "к прошлой неделе";
  else prevText = `к ${rangeText(prev.from, prev.to, true)}`;
  const hourly = days.length === 1;
  return {
    canNext: end < TODAY,
    days: hourly ? Array.from({ length: 24 }, (_, h) => `${from}T${String(h).padStart(2, "0")}`) : days,
    from,
    hourly,
    label,
    partial: end > TODAY,
    prev,
    prevText,
    span,
    to,
  };
};

/** The anchor one period earlier or later. */
export const stepAnchor = (span: Span, anchor: string, by: number) =>
  span === "day" ? shiftDay(anchor, by) : span === "week" ? shiftDay(anchor, by * 7) : shiftMonth(anchor, by);

// How a working day spreads over its hours: nothing at night, a peak before lunch and one after.
const HOURS = [0, 0, 0, 0, 0, 0, 0, 0.2, 0.6, 1.4, 2, 2.2, 1.6, 1.2, 1.9, 2.1, 1.8, 1.3, 0.8, 0.5, 0.4, 0.3, 0.1, 0];
/** «Сегодня» in the prototype ends at this hour. */
export const NOW_HOUR = 14;

/**
 * A day's rows spread over its hours (the product groups `model_runs.created_at` by hour; the demo rows are by day).
 * Today stops at the current hour; `until` cuts another day there too — yesterday compared with today so far.
 */
export const toHours = (rows: Row[], until = 23) =>
  rows.flatMap((r) => {
    const last = r.day === TODAY ? NOW_HOUR : until;
    const weights = HOURS.slice(0, last + 1);
    const sum = weights.reduce((s, w) => s + w, 0);
    return weights.flatMap((w, h) => {
      if (w === 0) return [];
      const k = w / sum;
      return [{ ...r, cacheRead: r.cacheRead * k, cost: r.cost === null ? null : r.cost * k, day: `${r.day}T${String(h).padStart(2, "0")}`, errors: r.errors * k, input: r.input * k, output: r.output * k, requests: r.requests * k }];
    });
  });
