// @jsxRuntime automatic — tsx does not give workspace packages their tsconfig; this keeps the worker rendering letters.
import { Column, Link, Row, Text } from "react-email";

import { C } from "./kit";

// The pieces a result is made of, as mail can carry them. A run's answer is a list of typed parts — markdown text and
// the widgets the server computed (show_table, show_metrics, show_chart); a converter turns each into blocks of this
// one vocabulary, numbers already formatted, and the letter draws them. Mail has no SVG, canvas or flex, so a chart
// is cells: columns for a series, a bar for a share or a goal, coloured segments for a composition. What mail can't
// hold (a radar) goes as a table and a line that the chart is in the product. Each block's dark colours are classes.

/** A run of text: bold, italic, code, a link. */
export interface Inline {
  text: string;
  b?: boolean;
  i?: boolean;
  code?: boolean;
  href?: string;
}

/** Which way a change reads: good, bad, or neither. */
export type Tone = "good" | "bad" | "flat";

export type LetterBlock =
  // ── markdown ─────────────────────────────────────────────────────────────────────────────────────────────────────
  | { type: "p"; text?: string; runs?: Inline[] }
  | { type: "heading"; text: string }
  /** A list; an item's `strong` — its lead in bold; `sub` — one level of nested items. */
  | {
      type: "list";
      ordered?: boolean;
      items: {
        strong?: string;
        text?: string;
        runs?: Inline[];
        sub?: string[];
      }[];
    }
  | { type: "quote"; text: string }
  | { type: "code"; text: string }
  | { type: "hr" }
  // ── show_table, or a table in markdown ───────────────────────────────────────────────────────────────────────────
  /** `right` — numeric columns; `total` — the summary row; `more` — what was cut: «Ещё 40 строк — в Metobe». */
  | {
      type: "table";
      title?: string;
      head: string[];
      rows: string[][];
      right?: number[];
      total?: string[];
      more?: string;
    }
  // ── show_metrics ─────────────────────────────────────────────────────────────────────────────────────────────────
  /** value: figures side by side (up to three). */
  | {
      type: "figures";
      items: { label: string; value: string; change?: string; tone?: Tone }[];
    }
  /** trend: the figure, its change, and its history as columns (0..1, oldest first). */
  | {
      type: "trend";
      label: string;
      value: string;
      change?: string;
      tone?: Tone;
      bars: number[];
      from: string;
      to: string;
    }
  /** goal or share: how far, as a bar (0..1). */
  | {
      type: "progress";
      label: string;
      value: string;
      caption: string;
      pct: number;
    }
  /** range: min, median, average, max. */
  | { type: "range"; label: string; cells: { label: string; value: string }[] }
  /** summary: facts in two columns. */
  | { type: "facts"; label: string; items: { label: string; value: string }[] }
  /** ranking, pareto's top, outliers: names with bars (0..1); `note` — what it means in one line. */
  | {
      type: "bars";
      label: string;
      note?: string;
      items: { name: string; value: string; pct: number }[];
    }
  /** movers: who grew, who fell. */
  | {
      type: "movers";
      label: string;
      note?: string;
      up: { name: string; value: string }[];
      down: { name: string; value: string }[];
    }
  /** composition, a pie: one bar of segments and the legend. */
  | {
      type: "stack";
      label: string;
      items: { name: string; value: string; pct: number }[];
    }
  // ── show_chart ───────────────────────────────────────────────────────────────────────────────────────────────────
  /** bar, line, area: the first series as columns (0..1), its first and last x, the last value. */
  | {
      type: "columns";
      label: string;
      value?: string;
      bars: number[];
      from: string;
      to: string;
    }
  /** What mail can't show: «График «Выручка по месяцам» — в Metobe». */
  | { type: "more"; text: string };

/** The block's dark colours, added to the letter's dark style. */
export const BLOCKS_DARK = `
.cell { border-color: #262626 !important; }
.head { background: #1f1f1f !important; }
.fig { background: #1f1f1f !important; }
.track { background: #262626 !important; }
.good { color: #4ade80 !important; }
.bad { color: #f87171 !important; }
.code { background: #1f1f1f !important; color: #e5e5e5 !important; }
.quote { border-color: #404040 !important; }
`;

/** The series colour and the composition's palette: the product's chart colours. */
const SERIES = "#2a78d6";
const PALETTE = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#4a3aa7",
  "#e34948",
];
const TRACK = "#ededed";
const TONE: Record<Tone, string> = {
  bad: "#b91c1c",
  flat: C.muted,
  good: "#15803d",
};
/** The class that carries the change's colour into a dark client. */
const TONE_CLASS: Record<Tone, string> = {
  bad: "bad",
  flat: "m",
  good: "good",
};

const T = { color: C.text, fontSize: 15, lineHeight: "24px" } as const;
const M = { color: C.muted, fontSize: 12, lineHeight: "16px" } as const;
const GAP = { margin: "0 0 16px" } as const;

const Runs = ({ runs }: { runs: Inline[] }) => (
  <>
    {runs.map((r, i) => {
      let el: React.ReactNode = r.text;
      if (r.code) {
        el = (
          <code
            className="code"
            style={{
              background: "#f5f5f5",
              borderRadius: 4,
              fontFamily: "ui-monospace, Menlo, Consolas, monospace",
              fontSize: 13,
              padding: "1px 4px",
            }}
          >
            {r.text}
          </code>
        );
      }
      if (r.b) {
        el = <strong>{el}</strong>;
      }
      if (r.i) {
        el = <em>{el}</em>;
      }
      if (r.href) {
        el = (
          <Link
            href={r.href}
            style={{ color: C.blue, textDecoration: "underline" }}
          >
            {el}
          </Link>
        );
      }
      // biome-ignore lint/suspicious/noArrayIndexKey: runs are a fixed sequence of one paragraph.
      return <span key={i}>{el}</span>;
    })}
  </>
);

const Label = ({ children }: { children: React.ReactNode }) => (
  <Text className="m" style={{ ...M, margin: "0 0 6px" }}>
    {children}
  </Text>
);

/** A bar of `pct` (0..1) on a track: two cells. */
const Bar = ({
  pct,
  color = SERIES,
  height = 6,
}: {
  pct: number;
  color?: string;
  height?: number;
}) => {
  const w = Math.round(Math.max(0, Math.min(1, pct)) * 100);
  return (
    <table
      cellPadding={0}
      cellSpacing={0}
      role="presentation"
      style={{ borderRadius: height / 2, overflow: "hidden", width: "100%" }}
    >
      <tbody>
        <tr>
          {w > 0 && (
            <td
              aria-hidden="true"
              style={{
                background: color,
                fontSize: 0,
                height,
                lineHeight: 0,
                width: `${w}%`,
              }}
            />
          )}
          {w < 100 && (
            <td
              aria-hidden="true"
              className="track"
              style={{ background: TRACK, fontSize: 0, height, lineHeight: 0 }}
            />
          )}
        </tr>
      </tbody>
    </table>
  );
};

/** A series as columns (0..1), with its first and last x under them. */
const Columns = ({
  bars,
  from,
  to,
  height = 56,
}: {
  bars: number[];
  from: string;
  to: string;
  height?: number;
}) => (
  <>
    <table
      cellPadding={0}
      cellSpacing={0}
      role="presentation"
      style={{ width: "100%" }}
    >
      <tbody>
        <tr>
          {bars.map((b, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the series' points in order.
            <td
              aria-hidden="true"
              key={i}
              style={{ height, padding: "0 1px", verticalAlign: "bottom" }}
            >
              <div
                style={{
                  background: i === bars.length - 1 ? SERIES : "#9cc2ee",
                  borderRadius: "2px 2px 0 0",
                  fontSize: 0,
                  height: Math.max(2, Math.round(b * height)),
                  lineHeight: 0,
                }}
              />
            </td>
          ))}
        </tr>
      </tbody>
    </table>
    <table
      cellPadding={0}
      cellSpacing={0}
      role="presentation"
      style={{ width: "100%" }}
    >
      <tbody>
        <tr>
          <td className="m" style={{ ...M, paddingTop: 4 }}>
            {from}
          </td>
          <td className="m" style={{ ...M, paddingTop: 4, textAlign: "right" }}>
            {to}
          </td>
        </tr>
      </tbody>
    </table>
  </>
);

/** A cell of a figure: the label small, the value large, the change coloured by how it reads. */
const Figure = ({
  label,
  value,
  change,
  tone,
}: {
  label: string;
  value: string;
  change?: string;
  tone?: Tone;
}) => (
  <div
    className="fig"
    style={{ background: "#fafafa", borderRadius: 10, padding: "10px 12px" }}
  >
    <div className="m" style={M}>
      {label}
    </div>
    <div
      className="t"
      style={{
        color: C.text,
        fontSize: 20,
        fontWeight: 600,
        lineHeight: "28px",
      }}
    >
      {value}
    </div>
    {change && (
      <div
        className={TONE_CLASS[tone ?? "flat"]}
        style={{ ...M, color: TONE[tone ?? "flat"] }}
      >
        {change}
      </div>
    )}
  </div>
);

const cellStyle = (right: boolean, head: boolean, first: boolean) => ({
  borderBottom: `1px solid ${C.border}`,
  color: head ? C.muted : C.text,
  fontSize: head ? 12 : 14,
  fontWeight: head ? 500 : 400,
  lineHeight: "20px",
  padding: "8px 10px",
  textAlign: right ? ("right" as const) : ("left" as const),
  // Only the first column wraps; sites and sums stay on one line.
  whiteSpace: first ? ("normal" as const) : ("nowrap" as const),
});

type Of<K extends LetterBlock["type"]> = Extract<LetterBlock, { type: K }>;

const DrawP = (b: Of<"p">) => (
  <Text className="t" style={{ ...T, margin: "0 0 12px" }}>
    {b.runs ? <Runs runs={b.runs} /> : b.text}
  </Text>
);

const DrawHeading = (b: Of<"heading">) => (
  <Text
    className="t"
    style={{
      color: C.text,
      fontSize: 16,
      fontWeight: 600,
      lineHeight: "24px",
      margin: "20px 0 8px",
    }}
  >
    {b.text}
  </Text>
);

const DrawList = (b: Of<"list">) => {
  const Tag = b.ordered === false ? "ul" : "ol";
  return (
    <Tag className="t" style={{ ...T, margin: "0 0 12px", paddingLeft: 22 }}>
      {b.items.map((it, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: list items in order.
        <li key={i} style={{ marginBottom: 6 }}>
          {it.strong && <strong>{it.strong}</strong>}
          {it.strong && (it.text || it.runs) && " — "}
          {it.runs ? <Runs runs={it.runs} /> : it.text}
          {it.sub && (
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
              {it.sub.map((s) => (
                <li key={s} style={{ marginBottom: 2 }}>
                  {s}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </Tag>
  );
};

const DrawQuote = (b: Of<"quote">) => (
  <Text
    className="t quote"
    style={{
      ...T,
      borderLeft: `3px solid ${C.border}`,
      color: C.text,
      margin: "0 0 12px",
      paddingLeft: 12,
    }}
  >
    {b.text}
  </Text>
);

const DrawCode = (b: Of<"code">) => (
  <pre
    className="code"
    style={{
      background: "#f5f5f5",
      borderRadius: 8,
      color: C.text,
      fontFamily: "ui-monospace, Menlo, Consolas, monospace",
      fontSize: 13,
      lineHeight: "20px",
      margin: "0 0 12px",
      overflowX: "auto",
      padding: "10px 12px",
      whiteSpace: "pre-wrap",
    }}
  >
    {b.text}
  </pre>
);

const DrawHr = (_b: Of<"hr">) => (
  <hr
    className="cell"
    style={{
      border: "none",
      borderTop: `1px solid ${C.border}`,
      margin: "16px 0",
    }}
  />
);

const DrawTable = (b: Of<"table">) => (
  <div style={GAP}>
    {b.title && <Label>{b.title}</Label>}
    <table
      cellPadding={0}
      cellSpacing={0}
      className="cell"
      role="presentation"
      style={{
        border: `1px solid ${C.border}`,
        borderCollapse: "separate",
        borderRadius: 10,
        width: "100%",
      }}
    >
      <thead>
        <tr className="head" style={{ background: "#fafafa" }}>
          {b.head.map((h, i) => (
            <th
              className="m cell"
              key={h}
              style={cellStyle(b.right?.includes(i) ?? false, true, i === 0)}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {b.rows.map((row) => (
          <tr key={row.join("|")}>
            {row.map((v, i) => (
              <td
                className="t cell"
                key={`${i}-${v}`}
                style={cellStyle(b.right?.includes(i) ?? false, false, i === 0)}
              >
                {v}
              </td>
            ))}
          </tr>
        ))}
        {b.total && (
          <tr>
            {b.total.map((v, i) => (
              <td
                className="t cell"
                key={`t-${i}-${v}`}
                style={{
                  ...cellStyle(b.right?.includes(i) ?? false, false, i === 0),
                  borderBottom: "none",
                  fontWeight: 600,
                }}
              >
                {v}
              </td>
            ))}
          </tr>
        )}
      </tbody>
    </table>
    {b.more && (
      <Text className="m" style={{ ...M, margin: "6px 0 0" }}>
        {b.more}
      </Text>
    )}
  </div>
);

const DrawFigures = (b: Of<"figures">) => (
  <Row style={GAP}>
    {b.items.map((f, i) => (
      <Column
        key={f.label}
        style={{
          paddingLeft: i ? 8 : 0,
          verticalAlign: "top",
          width: `${100 / b.items.length}%`,
        }}
      >
        <Figure {...f} />
      </Column>
    ))}
  </Row>
);

const DrawTrend = (b: Of<"trend">) => (
  <div
    className="fig"
    style={{
      background: "#fafafa",
      borderRadius: 10,
      margin: "0 0 16px",
      padding: "12px 14px",
    }}
  >
    <Row>
      <Column style={{ verticalAlign: "top", width: "42%" }}>
        <div className="m" style={M}>
          {b.label}
        </div>
        <div
          className="t"
          style={{
            color: C.text,
            fontSize: 22,
            fontWeight: 600,
            lineHeight: "30px",
          }}
        >
          {b.value}
        </div>
        {b.change && (
          <div
            className={TONE_CLASS[b.tone ?? "flat"]}
            style={{ ...M, color: TONE[b.tone ?? "flat"] }}
          >
            {b.change}
          </div>
        )}
      </Column>
      <Column style={{ paddingLeft: 12, verticalAlign: "bottom" }}>
        <Columns bars={b.bars} from={b.from} height={44} to={b.to} />
      </Column>
    </Row>
  </div>
);

const DrawProgress = (b: Of<"progress">) => (
  <div style={GAP}>
    <Label>{b.label}</Label>
    <Row>
      <Column
        className="t"
        style={{
          color: C.text,
          fontSize: 18,
          fontWeight: 600,
          lineHeight: "26px",
        }}
      >
        {b.value}
      </Column>
      <Column className="m" style={{ ...M, fontSize: 13, textAlign: "right" }}>
        {b.caption}
      </Column>
    </Row>
    <div style={{ paddingTop: 6 }}>
      <Bar height={8} pct={b.pct} />
    </div>
  </div>
);

const DrawRange = (b: Of<"range">) => (
  <div style={GAP}>
    <Label>{b.label}</Label>
    <Row>
      {b.cells.map((c, i) => (
        <Column
          key={c.label}
          style={{ paddingLeft: i ? 6 : 0, width: `${100 / b.cells.length}%` }}
        >
          <div
            className="fig"
            style={{
              background: "#fafafa",
              borderRadius: 8,
              padding: "8px 10px",
            }}
          >
            <div className="m" style={M}>
              {c.label}
            </div>
            <div
              className="t"
              style={{
                color: C.text,
                fontSize: 15,
                fontWeight: 600,
                lineHeight: "22px",
                whiteSpace: "nowrap",
              }}
            >
              {c.value}
            </div>
          </div>
        </Column>
      ))}
    </Row>
  </div>
);

const DrawFacts = (b: Of<"facts">) => (
  <div style={GAP}>
    <Label>{b.label}</Label>
    <table
      cellPadding={0}
      cellSpacing={0}
      role="presentation"
      style={{ width: "100%" }}
    >
      <tbody>
        {b.items.map((f) => (
          <tr key={f.label}>
            <td
              className="m cell"
              style={{
                ...M,
                borderBottom: `1px solid ${C.border}`,
                fontSize: 13,
                padding: "6px 0",
              }}
            >
              {f.label}
            </td>
            <td
              className="t cell"
              style={{
                borderBottom: `1px solid ${C.border}`,
                color: C.text,
                fontSize: 14,
                fontWeight: 600,
                padding: "6px 0",
                textAlign: "right",
              }}
            >
              {f.value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const DrawBars = (b: Of<"bars">) => (
  <div style={GAP}>
    <Label>{b.label}</Label>
    {b.note && (
      <Text
        className="t"
        style={{
          color: C.text,
          fontSize: 14,
          lineHeight: "20px",
          margin: "0 0 8px",
        }}
      >
        {b.note}
      </Text>
    )}
    <table
      cellPadding={0}
      cellSpacing={0}
      role="presentation"
      style={{ width: "100%" }}
    >
      <tbody>
        {b.items.map((it) => (
          <tr key={it.name}>
            <td
              className="t"
              style={{
                color: C.text,
                fontSize: 14,
                lineHeight: "20px",
                padding: "4px 10px 4px 0",
                width: "34%",
              }}
            >
              {it.name}
            </td>
            <td style={{ padding: "4px 0", verticalAlign: "middle" }}>
              <Bar pct={it.pct} />
            </td>
            <td
              className="t"
              style={{
                color: C.text,
                fontSize: 13,
                lineHeight: "20px",
                padding: "4px 0 4px 10px",
                textAlign: "right",
                whiteSpace: "nowrap",
                width: "22%",
              }}
            >
              {it.value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const DrawMovers = (b: Of<"movers">) => (
  <div style={GAP}>
    <Label>{b.label}</Label>
    {b.note && (
      <Text
        className="t"
        style={{
          color: C.text,
          fontSize: 14,
          lineHeight: "20px",
          margin: "0 0 8px",
        }}
      >
        {b.note}
      </Text>
    )}
    <table
      cellPadding={0}
      cellSpacing={0}
      role="presentation"
      style={{ width: "100%" }}
    >
      <tbody>
        {[
          ...b.up.map((m) => ({ ...m, tone: "good" as const })),
          ...b.down.map((m) => ({ ...m, tone: "bad" as const })),
        ].map((m) => (
          <tr key={`${m.tone}-${m.name}`}>
            <td
              className="t cell"
              style={{
                borderBottom: `1px solid ${C.border}`,
                color: C.text,
                fontSize: 14,
                lineHeight: "20px",
                padding: "6px 0",
              }}
            >
              {m.name}
            </td>
            <td
              className={`${m.tone} cell`}
              style={{
                borderBottom: `1px solid ${C.border}`,
                color: TONE[m.tone],
                fontSize: 14,
                fontWeight: 600,
                lineHeight: "20px",
                padding: "6px 0",
                textAlign: "right",
                whiteSpace: "nowrap",
              }}
            >
              {m.value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const DrawStack = (b: Of<"stack">) => (
  <div style={GAP}>
    <Label>{b.label}</Label>
    <table
      cellPadding={0}
      cellSpacing={0}
      role="presentation"
      style={{ borderRadius: 5, overflow: "hidden", width: "100%" }}
    >
      <tbody>
        <tr>
          {b.items.map((it, i) => (
            <td
              aria-hidden="true"
              key={it.name}
              style={{
                background: PALETTE[i % PALETTE.length],
                fontSize: 0,
                height: 10,
                lineHeight: 0,
                width: `${Math.max(1, Math.round(it.pct * 100))}%`,
              }}
            />
          ))}
        </tr>
      </tbody>
    </table>
    <table
      cellPadding={0}
      cellSpacing={0}
      role="presentation"
      style={{ marginTop: 8, width: "100%" }}
    >
      <tbody>
        {b.items.map((it, i) => (
          <tr key={it.name}>
            <td
              aria-hidden="true"
              style={{ padding: "3px 8px 3px 0", width: 10 }}
            >
              <div
                style={{
                  background: PALETTE[i % PALETTE.length],
                  borderRadius: 2,
                  fontSize: 0,
                  height: 8,
                  lineHeight: 0,
                  width: 8,
                }}
              />
            </td>
            <td
              className="t"
              style={{
                color: C.text,
                fontSize: 14,
                lineHeight: "20px",
                padding: "3px 0",
              }}
            >
              {it.name}
            </td>
            <td
              className="m"
              style={{
                ...M,
                fontSize: 13,
                padding: "3px 0",
                textAlign: "right",
                whiteSpace: "nowrap",
              }}
            >
              {it.value} · {Math.round(it.pct * 100)} %
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const DrawColumns = (b: Of<"columns">) => (
  <div style={GAP}>
    <Row>
      <Column>
        <Label>{b.label}</Label>
      </Column>
      {b.value && (
        <Column
          className="t"
          style={{
            color: C.text,
            fontSize: 14,
            fontWeight: 600,
            textAlign: "right",
            verticalAlign: "top",
          }}
        >
          {b.value}
        </Column>
      )}
    </Row>
    <Columns bars={b.bars} from={b.from} to={b.to} />
  </div>
);

const DrawMore = (b: Of<"more">) => (
  <Text
    className="m"
    style={{ ...M, fontSize: 13, lineHeight: "20px", margin: "0 0 8px" }}
  >
    {b.text}
  </Text>
);

/** Each block type and how mail draws it. */
const DRAW: { [K in LetterBlock["type"]]: (b: Of<K>) => React.ReactNode } = {
  bars: DrawBars,
  code: DrawCode,
  columns: DrawColumns,
  facts: DrawFacts,
  figures: DrawFigures,
  heading: DrawHeading,
  hr: DrawHr,
  list: DrawList,
  more: DrawMore,
  movers: DrawMovers,
  p: DrawP,
  progress: DrawProgress,
  quote: DrawQuote,
  range: DrawRange,
  stack: DrawStack,
  table: DrawTable,
  trend: DrawTrend,
};

export const Block = ({ b }: { b: LetterBlock }) =>
  (DRAW[b.type] as (x: LetterBlock) => React.ReactNode)(b);
