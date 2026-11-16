import type { Inline, LetterBlock } from "@metobe/emails/blocks";

// A letter's blocks as a Telegram message (D43): the same vocabulary the mail draws, in the HTML subset Telegram knows
// (<b>, <i>, <code>, <pre>, <a>, <blockquote>). What mail draws as cells — a column of bars, a share — is characters
// here: ▁▂▃▅▇ for a series, █░ for a share. A table is a <pre> of aligned columns. No state, no base: text in, text out.

export const escapeHtml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** Telegram's limit for a message. */
const LIMIT = 4096;
const SPARK = "▁▂▃▄▅▆▇█";
const TABLE_ROWS = 12;
const COLUMN_MAX = 28;

const inline = (runs: Inline[]) =>
  runs
    .map((r) => {
      let out = escapeHtml(r.text);
      if (r.code) {
        out = `<code>${out}</code>`;
      }
      if (r.b) {
        out = `<b>${out}</b>`;
      }
      if (r.i) {
        out = `<i>${out}</i>`;
      }
      if (r.href && /^https?:\/\//iu.test(r.href)) {
        out = `<a href="${escapeHtml(r.href).replaceAll('"', "&quot;")}">${out}</a>`;
      }
      return out;
    })
    .join("");

const textOf = (b: { text?: string; runs?: Inline[] }) =>
  b.runs ? inline(b.runs) : escapeHtml(b.text ?? "");

/** A series 0..1 as characters. */
const spark = (bars: number[]) =>
  bars
    .map(
      (v) =>
        SPARK[
          Math.min(
            SPARK.length - 1,
            Math.max(0, Math.round(v * (SPARK.length - 1)))
          )
        ]
    )
    .join("");

/** A share 0..1 as ten cells. */
const track = (pct: number) => {
  const filled = Math.min(10, Math.max(0, Math.round(pct * 10)));
  return "█".repeat(filled) + "░".repeat(10 - filled);
};

const cut = (s: string) =>
  s.length > COLUMN_MAX ? `${s.slice(0, COLUMN_MAX - 1)}…` : s;

/** A table as aligned columns in a <pre>: numbers to the right, at most `TABLE_ROWS` rows. */
const table = (b: Extract<LetterBlock, { type: "table" }>) => {
  const rows = [
    b.head,
    ...b.rows.slice(0, TABLE_ROWS),
    ...(b.total ? [b.total] : []),
  ].map((r) => r.map(cut));
  const widths = b.head.map((_, c) =>
    Math.max(...rows.map((r) => (r[c] ?? "").length))
  );
  const right = new Set(b.right);
  const line = (r: string[]) =>
    r
      .map((cell, c) =>
        right.has(c)
          ? cell.padStart(widths[c] ?? 0)
          : cell.padEnd(widths[c] ?? 0)
      )
      .join("  ")
      .trimEnd();
  const out = rows.map(line);
  const hidden = b.rows.length - TABLE_ROWS;
  const more = b.more ?? (hidden > 0 ? `+${hidden}` : undefined);
  return [
    b.title ? `<b>${escapeHtml(b.title)}</b>` : "",
    `<pre>${escapeHtml(out.join("\n"))}</pre>`,
    more ? `<i>${escapeHtml(more)}</i>` : "",
  ]
    .filter(Boolean)
    .join("\n");
};

const change = (c?: string) => (c ? ` ${escapeHtml(c)}` : "");

type Metric = Extract<
  LetterBlock,
  {
    type:
      | "figures"
      | "trend"
      | "progress"
      | "range"
      | "facts"
      | "bars"
      | "stack"
      | "movers"
      | "columns";
  }
>;

/** The figures and charts of show_metrics and show_chart, as lines and characters. */
const metricHtml = (b: Metric): string => {
  switch (b.type) {
    case "figures": {
      return b.items
        .map(
          (f) =>
            `${escapeHtml(f.label)}: <b>${escapeHtml(f.value)}</b>${change(f.change)}`
        )
        .join("\n");
    }
    case "trend": {
      return `${escapeHtml(b.label)}: <b>${escapeHtml(b.value)}</b>${change(b.change)}\n${spark(b.bars)}  ${escapeHtml(b.from)} → ${escapeHtml(b.to)}`;
    }
    case "progress": {
      return `${escapeHtml(b.label)}: <b>${escapeHtml(b.value)}</b>\n${track(b.pct)}  ${escapeHtml(b.caption)}`;
    }
    case "range": {
      return `${escapeHtml(b.label)}: ${b.cells.map((c) => `${escapeHtml(c.label)} <b>${escapeHtml(c.value)}</b>`).join(" · ")}`;
    }
    case "facts": {
      return [
        `<b>${escapeHtml(b.label)}</b>`,
        ...b.items.map((f) => `${escapeHtml(f.label)}: ${escapeHtml(f.value)}`),
      ].join("\n");
    }
    case "bars":
    case "stack": {
      const note =
        "note" in b && b.note ? `\n<i>${escapeHtml(b.note)}</i>` : "";
      return (
        [
          `<b>${escapeHtml(b.label)}</b>`,
          ...b.items.map(
            (i) =>
              `${track(i.pct)} ${escapeHtml(i.name)} — ${escapeHtml(i.value)}`
          ),
        ].join("\n") + note
      );
    }
    case "movers": {
      return [
        `<b>${escapeHtml(b.label)}</b>`,
        ...b.up.map((m) => `▲ ${escapeHtml(m.name)} ${escapeHtml(m.value)}`),
        ...b.down.map((m) => `▼ ${escapeHtml(m.name)} ${escapeHtml(m.value)}`),
        ...(b.note ? [`<i>${escapeHtml(b.note)}</i>`] : []),
      ].join("\n");
    }
    case "columns": {
      return `${escapeHtml(b.label)}${b.value ? `: <b>${escapeHtml(b.value)}</b>` : ""}\n${spark(b.bars)}  ${escapeHtml(b.from)} → ${escapeHtml(b.to)}`;
    }
    default: {
      return "";
    }
  }
};

/** One block as Telegram HTML; an empty string for what has nothing to say. */
const blockHtml = (b: LetterBlock): string => {
  switch (b.type) {
    case "p": {
      return textOf(b);
    }
    case "heading": {
      return `<b>${escapeHtml(b.text)}</b>`;
    }
    case "list": {
      return b.items
        .map((item, i) => {
          const mark = b.ordered ? `${i + 1}.` : "•";
          const head = item.strong ? `<b>${escapeHtml(item.strong)}</b> ` : "";
          const sub = (item.sub ?? [])
            .map((s) => `\n   – ${escapeHtml(s)}`)
            .join("");
          return `${mark} ${head}${textOf(item)}${sub}`;
        })
        .join("\n");
    }
    case "quote": {
      return `<blockquote>${escapeHtml(b.text)}</blockquote>`;
    }
    case "code": {
      return `<pre>${escapeHtml(b.text)}</pre>`;
    }
    case "hr": {
      return "———";
    }
    case "table": {
      return table(b);
    }
    case "figures":
    case "trend":
    case "progress":
    case "range":
    case "facts":
    case "bars":
    case "stack":
    case "movers":
    case "columns": {
      return metricHtml(b);
    }
    case "more": {
      return `<i>${escapeHtml(b.text)}</i>`;
    }
    default: {
      return "";
    }
  }
};

/**
 * The blocks as one message body, whole blocks only: when the next does not fit under `limit`, the rest is cut and
 * `ellipsis` says so. A single block longer than the limit is cut in the middle of its text, tags closed by dropping it
 * to plain text.
 */
export const telegramHtml = (
  blocks: LetterBlock[],
  { limit = LIMIT, ellipsis = "…" }: { limit?: number; ellipsis?: string } = {}
) => {
  const parts: string[] = [];
  let size = 0;
  for (const b of blocks) {
    const html = blockHtml(b);
    if (!html) {
      continue;
    }
    const next = size + html.length + (parts.length > 0 ? 2 : 0);
    if (next + ellipsis.length + 2 > limit) {
      if (parts.length === 0) {
        // One block alone is too long: plain text, cut.
        parts.push(
          escapeHtml(html.replaceAll(/<[^>]+>/gu, "")).slice(0, limit - 4)
        );
      }
      parts.push(ellipsis);
      return parts.join("\n\n");
    }
    parts.push(html);
    size = next;
  }
  return parts.join("\n\n");
};
