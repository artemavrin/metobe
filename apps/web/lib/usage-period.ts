// The period «Расходы» shows (P10): a day, a week from the viewer's first weekday, a month — each stepped with ‹ ›
// — or any range picked on the calendar. Days are local `YYYY-MM-DD` keys of the viewer's time zone. The comparison
// is the same stretch just before: a month in progress against as many first days of the month before, a week against
// the same days of the last one, today so far against yesterday up to the same hour. Lives in the URL:
// `?p=week&d=2026-10-29`, `?p=range&from=2026-10-01&to=2026-10-15`.

export type Span = "day" | "week" | "month" | "range";
export const SPANS = ["day", "week", "month", "range"] as const;

export interface PeriodParams {
  span: Span;
  /** A day inside the period (day, week, month); the range's last day. */
  anchor: string;
  range?: { from: string; to: string };
}

export interface Period extends PeriodParams {
  from: string;
  /** The period's last day so far: today, if it runs into today. */
  to: string;
  /** Its last day whole — past today for a week or month in progress. */
  end: string;
  /** The chart's buckets: days, or `2026-10-29T09` hours for a single day. */
  buckets: string[];
  hourly: boolean;
  prev: { from: string; to: string };
  /** Today so far is compared with yesterday up to this hour; none — the whole of it. */
  prevUntilHour: number | null;
  canNext: boolean;
}

const DAY = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u;
const isDay = (v: unknown): v is string =>
  typeof v === "string" &&
  DAY.test(v) &&
  new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);

const date = (d: string) => new Date(`${d}T00:00:00Z`);
const key = (d: Date) => d.toISOString().slice(0, 10);

export const shiftDay = (d: string, by: number) => {
  const x = date(d);
  x.setUTCDate(x.getUTCDate() + by);
  return key(x);
};
const shiftMonth = (d: string, by: number) => {
  const [y, m] = d.split("-").map(Number) as [number, number];
  return key(new Date(Date.UTC(y, m - 1 + by, 1)));
};
const monthEnd = (d: string) => shiftDay(shiftMonth(d, 1), -1);
/** The week's first day; `weekStart` is ISO: 1 Monday, 6 Saturday, 7 Sunday. */
export const weekFrom = (d: string, weekStart: number) => {
  const iso = date(d).getUTCDay() || 7;
  return shiftDay(d, -((iso - weekStart + 7) % 7));
};
const earlier = (a: string, b: string) => (a < b ? a : b);

export const daysBetween = (from: string, to: string) => {
  const out: string[] = [];
  for (let d = from; d <= to; d = shiftDay(d, 1)) {
    out.push(d);
  }
  return out;
};

/** The day and hour it is now where the viewer is. */
export const nowIn = (timeZone: string, now = new Date()) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      month: "2-digit",
      timeZone,
      year: "numeric",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  return {
    hour: Number(parts.hour),
    today: `${parts.year}-${parts.month}-${parts.day}`,
  };
};

/** The period from the URL; anything off is this month. Nothing ahead of today. */
export const readPeriod = (
  q: { p?: string; d?: string; from?: string; to?: string },
  today: string
): PeriodParams => {
  const span = (SPANS as readonly string[]).includes(q.p ?? "")
    ? (q.p as Span)
    : "month";
  if (span === "range") {
    if (isDay(q.from) && isDay(q.to)) {
      const [a, b] = q.from <= q.to ? [q.from, q.to] : [q.to, q.from];
      const to = earlier(b, today);
      return { anchor: to, range: { from: earlier(a, to), to }, span };
    }
    return { anchor: today, span: "month" };
  }
  return { anchor: isDay(q.d) ? earlier(q.d, today) : today, span };
};

export const periodOf = (
  p: PeriodParams,
  today: string,
  weekStart: number,
  hour = 23
): Period => {
  let from: string;
  let end: string;
  if (p.span === "day") {
    from = p.anchor;
    end = p.anchor;
  } else if (p.span === "week") {
    from = weekFrom(p.anchor, weekStart);
    end = shiftDay(from, 6);
  } else if (p.span === "month") {
    from = `${p.anchor.slice(0, 7)}-01`;
    end = monthEnd(from);
  } else {
    from = p.range?.from ?? p.anchor;
    end = p.range?.to ?? p.anchor;
  }
  const to = earlier(end, today);
  const days = daysBetween(from, to);
  // As many days of the stretch before: a month's first days, last week's same days, or the days just before.
  let prevFrom = shiftDay(from, -days.length);
  if (p.span === "month") {
    prevFrom = shiftMonth(from, -1);
  }
  if (p.span === "week") {
    prevFrom = shiftDay(from, -7);
  }
  const prevTo = earlier(
    shiftDay(prevFrom, days.length - 1),
    shiftDay(from, -1)
  );
  const hourly = days.length === 1;
  return {
    ...p,
    buckets: hourly
      ? Array.from(
          { length: 24 },
          (_, h) => `${from}T${String(h).padStart(2, "0")}`
        )
      : days,
    canNext: end < today,
    end,
    from,
    hourly,
    prev: { from: prevFrom, to: prevTo },
    prevUntilHour: hourly && from === today ? hour : null,
    to,
  };
};

/** The anchor one period earlier or later; never past today. */
export const stepAnchor = (p: PeriodParams, by: number, today: string) => {
  if (p.span === "month") {
    return earlier(shiftMonth(p.anchor, by), today);
  }
  return earlier(shiftDay(p.anchor, p.span === "week" ? by * 7 : by), today);
};

/** The period as a query string. */
export const periodQuery = (p: PeriodParams) =>
  p.span === "range" && p.range
    ? `?p=range&from=${p.range.from}&to=${p.range.to}`
    : `?p=${p.span}&d=${p.anchor}`;
