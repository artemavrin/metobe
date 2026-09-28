"use client";

import { useFormatter } from "next-intl";

import type { ChartSeries, ChartView } from "@/lib/chart-data";

// How a chart speaks its numbers and dates, in the user's language — shared by the chart and its table of data.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;

/** A date out of an axis value; a date-only one is a calendar day, read in UTC. */
const asDate = (value: unknown) => {
  const text = String(value);
  const date = new Date(text);
  return Number.isNaN(date.getTime())
    ? null
    : { date, utc: DATE_ONLY.test(text) };
};

/** How the chart speaks its numbers and dates, in the user's language. */
export const useChartFormat = (view: ChartView) => {
  const format = useFormatter();
  // Ticks across years say the month and the year; within one year, the day and the month.
  const years = new Set(
    view.points.flatMap((p) => {
      const at = view.x.type === "date" ? asDate(p.x) : null;
      return at ? [at.date.getUTCFullYear()] : [];
    })
  );
  // Points on the first of each month are months: said as «янв.», not «1 янв.».
  const monthly =
    view.x.type === "date" &&
    view.points.length > 1 &&
    view.points.every((p) => asDate(p.x)?.date.getUTCDate() === 1);
  const date = (value: unknown, style: "tick" | "full") => {
    const at = asDate(value);
    if (!at) {
      return String(value);
    }
    const zone = at.utc ? { timeZone: "UTC" } : {};
    if (style === "full") {
      return format.dateTime(at.date, { dateStyle: "medium", ...zone });
    }
    if (monthly) {
      return format.dateTime(
        at.date,
        years.size > 1
          ? { month: "short", year: "2-digit", ...zone }
          : { month: "short", ...zone }
      );
    }
    return format.dateTime(
      at.date,
      years.size > 1
        ? { month: "short", year: "2-digit", ...zone }
        : { day: "numeric", month: "short", ...zone }
    );
  };
  return {
    value: (n: number, s?: ChartSeries) =>
      `${format.number(n, { maximumFractionDigits: 2 })}${s?.unit ? ` ${s.unit}` : ""}`,
    x: (value: unknown, style: "tick" | "full") => {
      if (view.x.type === "date") {
        return date(value, style);
      }
      if (view.x.type === "number" && typeof value === "number") {
        return format.number(value, { maximumFractionDigits: 2 });
      }
      const text = String(value ?? "");
      return style === "tick" && text.length > 14
        ? `${text.slice(0, 13)}…`
        : text;
    },
    y: (n: number) =>
      format.number(n, { maximumFractionDigits: 1, notation: "compact" }),
  };
};

export type Format = ReturnType<typeof useChartFormat>;
