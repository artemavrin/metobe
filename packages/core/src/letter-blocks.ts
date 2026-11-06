import type { ChartInput, ChartOutput } from "@metobe/contracts/chart";
import type { ChatMessage } from "@metobe/contracts/chat";
import type { MetricResult, MetricsOutput } from "@metobe/contracts/metrics";
import type { TableInput, TableOutput } from "@metobe/contracts/table";
import type { Inline, LetterBlock, Tone } from "@metobe/emails/blocks";
import { numberFormat } from "@metobe/i18n/numbers";
import type { NumberFormat } from "@metobe/i18n/numbers";
import type { PhrasingContent, RootContent, Table } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";

// A run's answer as a letter can carry it (D24, P14). The answer is the parts the chat draws — markdown text and the
// widgets the server computed (show_table, show_metrics, show_chart); each turns into blocks of one vocabulary
// (@metobe/emails/blocks), its figures said by the same formatters the chat uses. The work's steps (searches, pages
// read, MCP calls) stay out: they are how the answer was found, not the answer. What mail can't draw becomes a line
// that it is in the product. Nothing the model wrote reaches the letter as HTML: markdown is parsed, raw HTML and
// images are dropped, links pass only as http(s).

type Part = ChatMessage["parts"][number];
type Locale = "ru" | "en";

const plural = (n: number, one: string, few: string, many: string) => {
  const form = new Intl.PluralRules("ru").select(n);
  if (form === "one") {
    return one;
  }
  return form === "few" ? few : many;
};

const WORDS = {
  en: {
    avg: "Average",
    chart: (title: string) => `Chart «${title}» — in Metobe.`,
    count: "Count",
    goal: "goal",
    grewFell: (up: number, down: number) => `Grew: ${up}, fell: ${down}`,
    max: "Max",
    median: "Median",
    min: "Min",
    more: "The rest — in Metobe.",
    net: "in total",
    outliers: (n: number, fence: string) =>
      `${n} far above the usual: usually up to ${fence}.`,
    pareto: (n: number, of: number) => `${n} of ${of} make 80 %.`,
    rest: (n: number) => `${n} more`,
    rows: (n: number) => `${n} more ${n === 1 ? "row" : "rows"} — in Metobe.`,
    sum: "Sum",
    toPrevious: (bucket?: string) =>
      ({
        day: "to the day before",
        month: "to the month before",
        week: "to the week before",
        year: "to the year before",
      })[bucket ?? ""] ?? "to the previous period",
    total: "Total",
  },
  ru: {
    avg: "Среднее",
    chart: (title: string) => `График «${title}» — в Metobe.`,
    count: "Строк",
    goal: "цель",
    grewFell: (up: number, down: number) => `Выросли: ${up}, упали: ${down}`,
    max: "Макс.",
    median: "Медиана",
    min: "Мин.",
    more: "Продолжение — в Metobe.",
    net: "в сумме",
    outliers: (n: number, fence: string) =>
      `${n} заметно выше обычного: обычно до ${fence}.`,
    pareto: (n: number, of: number) => `${n} из ${of} дают 80 %.`,
    rest: (n: number) => `Ещё ${n}`,
    rows: (n: number) =>
      `Ещё ${n} ${plural(n, "строка", "строки", "строк")} — в Metobe.`,
    sum: "Сумма",
    toPrevious: (bucket?: string) =>
      ({
        day: "к прошлому дню",
        month: "к прошлому месяцу",
        week: "к прошлой неделе",
        year: "к прошлому году",
      })[bucket ?? ""] ?? "к прошлому периоду",
    total: "Итого",
  },
};
type Words = (typeof WORDS)["ru"];

export interface LetterBlocksOptions {
  locale: Locale;
  /** How many blocks the letter shows before «The rest — in Metobe». */
  maxBlocks?: number;
  /** How many rows a table shows. */
  maxRows?: number;
}

interface Ctx {
  f: NumberFormat;
  w: Words;
  locale: Locale;
  maxRows: number;
}

// ── markdown ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const SAFE_LINK = /^https?:\/\//iu;

/** Inline markdown as runs: bold, italic, code, links (http(s) only); images and raw HTML dropped. */
const runsOf = (
  nodes: PhrasingContent[],
  mark: Omit<Inline, "text"> = {}
): Inline[] =>
  nodes.flatMap((n): Inline[] => {
    switch (n.type) {
      case "text": {
        return [{ ...mark, text: n.value }];
      }
      case "strong": {
        return runsOf(n.children, { ...mark, b: true });
      }
      case "emphasis": {
        return runsOf(n.children, { ...mark, i: true });
      }
      case "delete": {
        return runsOf(n.children, mark);
      }
      case "inlineCode": {
        return [{ ...mark, code: true, text: n.value }];
      }
      case "link": {
        return runsOf(
          n.children,
          SAFE_LINK.test(n.url) ? { ...mark, href: n.url } : mark
        );
      }
      case "break": {
        return [{ ...mark, text: " " }];
      }
      default: {
        return [];
      }
    }
  });

const plain = (runs: Inline[]) => runs.map((r) => r.text).join("");

const NUMERIC = /^[−+-]?[\d\s .,]+(?:\s?(?:%|₽|\$|€|шт\.?|тыс\.?|млн|млрд))*$/u;

const tableOf = (t: Table): LetterBlock => {
  const cells = t.children.map((row) =>
    row.children.map((c) => plain(runsOf(c.children)))
  );
  const [head = [], ...rows] = cells;
  // Right: what the markdown says (`---:`), or a column of numbers.
  const right = head
    .map((_, i) => i)
    .filter(
      (i) =>
        t.align?.[i] === "right" ||
        (i > 0 &&
          rows.length > 0 &&
          rows.every((r) => NUMERIC.test((r[i] ?? "").trim()) || !r[i]))
    );
  return { head, right, rows, type: "table" };
};

const fromMd = (text: string): LetterBlock[] => {
  const tree = fromMarkdown(text, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  return tree.children.flatMap((n: RootContent): LetterBlock[] => {
    switch (n.type) {
      case "paragraph": {
        const runs = runsOf(n.children);
        return plain(runs).trim() ? [{ runs, type: "p" }] : [];
      }
      case "heading": {
        return [{ text: plain(runsOf(n.children)), type: "heading" }];
      }
      case "list": {
        return [
          {
            items: n.children.map((item) => {
              const [first, ...rest] = item.children;
              const runs =
                first?.type === "paragraph" ? runsOf(first.children) : [];
              const sub = rest.flatMap((r) =>
                r.type === "list"
                  ? r.children.map((li) =>
                      li.children
                        .map((c) =>
                          c.type === "paragraph"
                            ? plain(runsOf(c.children))
                            : ""
                        )
                        .join(" ")
                    )
                  : []
              );
              return sub.length ? { runs, sub } : { runs };
            }),
            ordered: Boolean(n.ordered),
            type: "list",
          },
        ];
      }
      case "blockquote": {
        const quote = n.children
          .map((c) => (c.type === "paragraph" ? plain(runsOf(c.children)) : ""))
          .join(" ");
        return [{ text: quote, type: "quote" }];
      }
      case "code": {
        return [{ text: n.value, type: "code" }];
      }
      case "thematicBreak": {
        return [{ type: "hr" }];
      }
      case "table": {
        return [tableOf(n)];
      }
      default: {
        return [];
      }
    }
  });
};

// ── show_table ───────────────────────────────────────────────────────────────────────────────────────────────────────

type Cell = string | number | null;

const dateOf = (
  value: Cell,
  locale: Locale,
  style: "day" | "month" = "day"
) => {
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) {
    return String(value ?? "");
  }
  return new Intl.DateTimeFormat(
    locale,
    style === "month"
      ? { month: "short", timeZone: "UTC" }
      : { day: "numeric", month: "short", timeZone: "UTC" }
  ).format(d);
};

const summarise = (values: number[], how: string) => {
  if (values.length === 0) {
    return null;
  }
  if (how === "avg") {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
  if (how === "min") {
    return Math.min(...values);
  }
  if (how === "max") {
    return Math.max(...values);
  }
  return values.reduce((a, b) => a + b, 0);
};

const showTable = (
  input: TableInput,
  output: TableOutput | undefined,
  c: Ctx
): LetterBlock[] => {
  const rows = (output?.data ??
    (input as { rows?: Cell[][] }).rows ??
    []) as Cell[][];
  const cols = input.columns;
  const say = (v: Cell, i: number) => {
    const type = cols[i]?.type;
    if (v === null || v === undefined) {
      return "";
    }
    if (type === "number" && typeof v === "number") {
      return c.f.exact(v);
    }
    return type === "date" ? dateOf(v, c.locale) : String(v);
  };
  const shown = rows.slice(0, c.maxRows);
  const all = output?.total ?? rows.length;
  const summed = cols.some((col) => col.summary);
  const total = summed
    ? cols.map((col, i) => {
        if (i === 0) {
          return c.w.total;
        }
        if (!col.summary) {
          return "";
        }
        const v = summarise(
          rows
            .map((r) => r[i])
            .filter((x): x is number => typeof x === "number"),
          col.summary
        );
        return v === null ? "" : c.f.exact(v);
      })
    : undefined;
  return [
    {
      head: cols.map((col) => col.label),
      right: cols.flatMap((col, i) => (col.type === "number" ? [i] : [])),
      rows: shown.map((r) => cols.map((_, i) => say(r[i] ?? null, i))),
      title: input.title,
      type: "table",
      ...(total && { total }),
      ...(all > shown.length && { more: c.w.rows(all - shown.length) }),
    },
  ];
};

// ── show_metrics ─────────────────────────────────────────────────────────────────────────────────────────────────────

const toneOf = (change: number, good: "up" | "down" = "up"): Tone => {
  if (change === 0) {
    return "flat";
  }
  return change > 0 === (good === "up") ? "good" : "bad";
};

const norm = (xs: number[]) => {
  const max = Math.max(...xs.map(Math.abs), 0);
  return max > 0 ? xs.map((x) => Math.max(0, x) / max) : xs.map(() => 0);
};

const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

interface Figure {
  figure: { label: string; value: string };
}

/** Each metric form as a block; `value` comes back as a figure, to be grouped with its neighbours. */
const FORMS: Record<
  MetricResult["form"],
  (r: MetricResult, c: Ctx) => LetterBlock | Figure | null
> = {
  composition: (r, c) => {
    const { f, w } = c;
    const u = (n: number) => f.withUnit(f.short(n), r.unit);
    const parts = r.parts ?? [];
    const sum = parts.reduce((a, p) => a + num(p.value), 0) || 1;
    return {
      items: parts.map((p) => ({
        name: p.rest ? w.rest(p.count ?? 0) : p.name,
        pct: num(p.value) / sum,
        value: u(num(p.value)),
      })),
      label: r.label,
      type: "stack",
    };
  },
  goal: (r, c) => {
    const { f, w } = c;
    const u = (n: number) => f.withUnit(f.short(n), r.unit);
    const pct = r.target ? num(r.value) / num(r.target) : 0;
    return {
      caption: `${w.goal} — ${u(num(r.target))}`,
      label: r.label,
      pct,
      type: "progress",
      value: `${u(num(r.value))} · ${f.percent(pct * 100, 0)}`,
    };
  },
  movers: (r, c) => {
    const { f, w } = c;
    const all = r.movers ?? [];
    const say = (m: (typeof all)[number]) =>
      `${f.signed(num(m.change))}${r.unit ? ` ${r.unit}` : ""}${m.pct === null ? "" : ` · ${f.signed(num(m.pct))} %`}`;
    const net =
      r.net === undefined
        ? ""
        : `; ${w.net} ${f.signed(num(r.net))}${r.unit ? ` ${r.unit}` : ""}`;
    return {
      down: all
        .filter((m) => num(m.change) < 0)
        .map((m) => ({ name: m.name, value: say(m) })),
      label: r.label,
      note: `${w.grewFell(r.up ?? 0, r.down ?? 0)}${net}.`,
      type: "movers",
      up: all
        .filter((m) => num(m.change) > 0)
        .map((m) => ({ name: m.name, value: say(m) })),
    };
  },
  outliers: (r, c) => {
    const { f, w } = c;
    const u = (n: number) => f.withUnit(f.short(n), r.unit);
    const out = (r.outliers ?? []).slice(0, 5);
    const pcts = norm(out.map((x) => num(x.value)));
    return {
      items: out.map((x, i) => ({
        name: [x.name, x.date && dateOf(x.date, c.locale)]
          .filter(Boolean)
          .join(" · "),
        pct: pcts[i] ?? 0,
        value: u(num(x.value)),
      })),
      label: r.label,
      note:
        r.fence === undefined
          ? undefined
          : w.outliers(r.outlierCount ?? out.length, u(num(r.fence))),
      type: "bars",
    };
  },
  pareto: (r, c) => {
    const { f, w } = c;
    const top = (r.pareto ?? []).slice(0, 6);
    return {
      items: top.map((x) => ({
        name: x.name,
        pct: num(x.cum),
        value: f.percent(num(x.cum) * 100, 0),
      })),
      label: r.label,
      note: r.n80 && r.groupCount ? w.pareto(r.n80, r.groupCount) : undefined,
      type: "bars",
    };
  },
  range: (r, c) => {
    const { f, w } = c;
    const u = (n: number) => f.withUnit(f.short(n), r.unit);
    const g = r.range;
    return g
      ? {
          cells: [
            { label: w.min, value: u(num(g.min)) },
            { label: w.median, value: u(num(g.median)) },
            { label: w.avg, value: u(num(g.avg)) },
            { label: w.max, value: u(num(g.max)) },
          ],
          label: r.label,
          type: "range",
        }
      : null;
  },
  ranking: (r, c) => {
    const { f } = c;
    const u = (n: number) => f.withUnit(f.short(n), r.unit);
    const items = r.items ?? [];
    const pcts = norm(items.map((x) => num(x.value)));
    return {
      items: items.map((x, i) => ({
        name: x.name,
        pct: pcts[i] ?? 0,
        value: u(num(x.value)),
      })),
      label: r.label,
      type: "bars",
    };
  },
  share: (r, c) => {
    const { f } = c;
    const pct = r.whole ? num(r.value) / num(r.whole) : 0;
    return {
      caption: (r.names ?? []).join(", "),
      label: r.label,
      pct,
      type: "progress",
      value: f.percent(pct * 100, 0),
    };
  },
  summary: (r, c) => {
    const { f, w } = c;
    const u = (n: number) => f.withUnit(f.short(n), r.unit);
    const names: Record<string, string> = {
      avg: w.avg,
      count: w.count,
      max: w.max,
      median: w.median,
      min: w.min,
      rows: w.count,
      sum: w.sum,
    };
    return {
      items: (r.facts ?? []).map((x) => ({
        label: names[x.fact] ?? x.fact,
        value: x.fact === "rows" ? f.exact(num(x.value)) : u(num(x.value)),
      })),
      label: r.label,
      type: "facts",
    };
  },
  trend: (r, c) => {
    const { f, w } = c;
    const u = (n: number) => f.withUnit(f.short(n), r.unit);
    const series = r.series ?? [];
    const change = r.delta?.change;
    return {
      bars: norm(series.map((p) => num(p.value))),
      change:
        change === null || change === undefined
          ? undefined
          : `${f.signed(num(change))} % ${w.toPrevious(r.bucket)}`,
      from: dateOf(
        series[0]?.x ?? "",
        c.locale,
        r.bucket === "month" ? "month" : "day"
      ),
      label: r.label,
      to: dateOf(
        series.at(-1)?.x ?? "",
        c.locale,
        r.bucket === "month" ? "month" : "day"
      ),
      tone:
        change === null || change === undefined
          ? undefined
          : toneOf(num(change), r.delta?.good),
      type: "trend",
      value: u(num(r.delta?.current ?? r.value)),
    };
  },
  value: (r, c) => {
    const { f } = c;
    const u = (n: number) => f.withUnit(f.short(n), r.unit);
    return { figure: { label: r.label, value: u(num(r.value)) } };
  },
};

const metric = (r: MetricResult, c: Ctx) => FORMS[r.form]?.(r, c) ?? null;

const showMetrics = (output: MetricsOutput, c: Ctx): LetterBlock[] => {
  const out: LetterBlock[] = [];
  for (const r of output.items) {
    const m = metric(r, c);
    if (!m) {
      continue;
    }
    if ("figure" in m) {
      // Plain figures side by side, three to a row.
      const last = out.at(-1);
      if (last?.type === "figures" && last.items.length < 3) {
        last.items.push(m.figure);
      } else {
        out.push({ items: [m.figure], type: "figures" });
      }
      continue;
    }
    out.push(m);
  }
  return out;
};

// ── show_chart ───────────────────────────────────────────────────────────────────────────────────────────────────────

const showChart = (
  input: ChartInput,
  output: ChartOutput | undefined,
  c: Ctx
): LetterBlock[] => {
  const points = (output?.data ??
    (input as { points?: Cell[][] }).points ??
    []) as Cell[][];
  const { series } = input;
  const [first] = series;
  const unit = first?.unit;
  const x = (v: Cell) =>
    input.x.type === "date" ? dateOf(v, c.locale) : String(v ?? "");
  const values = points.map((p) => num(p[1]));
  const inProduct: LetterBlock = { text: c.w.chart(input.title), type: "more" };
  const many = series.length > 1 ? [inProduct] : [];
  const bars = (): LetterBlock => {
    const pcts = norm(values);
    return {
      items: points.slice(0, 8).map((p, i) => ({
        name: x(p[0] ?? null),
        pct: pcts[i] ?? 0,
        value: c.f.withUnit(c.f.short(values[i] ?? 0), unit),
      })),
      label: input.title,
      type: "bars",
    };
  };
  switch (input.kind) {
    case "area":
    case "line":
    case "bar": {
      if (input.kind === "bar" && input.x.type === "category") {
        return [bars(), ...many];
      }
      return [
        {
          bars: norm(values),
          from: x(points[0]?.[0] ?? null),
          label: input.title,
          to: x(points.at(-1)?.[0] ?? null),
          type: "columns",
          value: c.f.withUnit(c.f.short(values.at(-1) ?? 0), unit),
        },
        ...many,
      ];
    }
    case "pie": {
      const sum = values.reduce((a, b) => a + b, 0) || 1;
      return [
        {
          items: points.map((p, i) => ({
            name: x(p[0] ?? null),
            pct: (values[i] ?? 0) / sum,
            value: c.f.withUnit(c.f.short(values[i] ?? 0), unit),
          })),
          label: input.title,
          type: "stack",
        },
      ];
    }
    case "radial": {
      return [bars()];
    }
    default: {
      // radar, composed: the numbers as a table, the picture in the product.
      return [
        {
          head: [input.x.label, ...series.map((s) => s.label)],
          right: series.map((_, i) => i + 1),
          rows: points
            .slice(0, c.maxRows)
            .map((p) => [
              x(p[0] ?? null),
              ...series.map((_, i) => c.f.exact(num(p[i + 1]))),
            ]),
          title: input.title,
          type: "table",
        },
        inProduct,
      ];
    }
  }
};

// ── the answer ───────────────────────────────────────────────────────────────────────────────────────────────────────

const ofPart = (p: Part, c: Ctx): LetterBlock[] => {
  if (p.type === "text") {
    return fromMd(p.text);
  }
  if (!("state" in p) || p.state !== "output-available") {
    return [];
  }
  if (p.type === "tool-show_table") {
    return showTable(p.input as TableInput, p.output as TableOutput, c);
  }
  if (p.type === "tool-show_metrics") {
    return showMetrics(p.output as MetricsOutput, c);
  }
  if (p.type === "tool-show_chart") {
    return showChart(p.input as ChartInput, p.output as ChartOutput, c);
  }
  // Searches, pages read, MCP calls, reasoning: the steps, not the result.
  return [];
};

/** A run's answer as the blocks of its letter; past `maxBlocks`, the rest is in the product. */
export const letterBlocks = (
  parts: ChatMessage["parts"],
  { locale, maxBlocks = 14, maxRows = 10 }: LetterBlocksOptions
): LetterBlock[] => {
  const c: Ctx = { f: numberFormat(locale), locale, maxRows, w: WORDS[locale] };
  const blocks = parts.flatMap((p) => ofPart(p, c));
  return blocks.length > maxBlocks
    ? [...blocks.slice(0, maxBlocks), { text: c.w.more, type: "more" }]
    : blocks;
};
