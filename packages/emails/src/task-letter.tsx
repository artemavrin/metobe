import {
  Body,
  Button,
  Column,
  Container,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Row,
  Text,
} from "react-email";

import { C, FONT, LetterHead, Mark, renderLetter } from "./kit";

// A letter from a periodic task (D38, P14): sent only when the task waits for the person — a new result, a question,
// an action after a failure. «Nothing new» never goes out. Per task, turned on in its card. On top, which task and
// which run; then what happened in one line, the result itself as mail can carry it (paragraphs, a list, a table, key
// figures — charts stay in the product), one button, and why the letter came with a link that turns it off for this
// task. The words come translated; the task's colour is its hex.

export type TaskLetterKind = "result" | "question" | "action";

export type TaskLetterBlock =
  | { type: "p"; text: string }
  /** A list; `strong` — the item's lead in bold (who wrote, which product). */
  | { type: "list"; items: { strong?: string; text: string }[] }
  /** A table; `right` — the columns aligned right (numbers). */
  | { type: "table"; head: string[]; rows: string[][]; right?: number[] }
  /** Key figures from a widget the letter can't draw: the number large, its change small. */
  | {
      type: "figures";
      items: { label: string; value: string; change?: string }[];
    };

export interface TaskLetterProps {
  locale: string;
  /** The line a client shows after the subject in the list. */
  preview: string;
  kind: TaskLetterKind;
  /** «Новый итог», «Вопрос», «Нужно действие». */
  label: string;
  task: { name: string; color: string; meta: string };
  /** What happened, in one line. */
  heading: string;
  blocks: TaskLetterBlock[];
  /** What stays in the product: «Графики и разбивка по направлениям — в Metobe». */
  more?: string;
  button: { href: string; label: string };
  /** Why the letter came. */
  why: string;
  off: { href: string; label: string };
}

const DARK = `
.card { background: #171717 !important; border-color: #262626 !important; }
.t { color: #fafafa !important; }
.m { color: #a3a3a3 !important; }
.cell { border-color: #262626 !important; }
.head { background: #1f1f1f !important; }
.fig { background: #1f1f1f !important; }
`;

/** The label's colour: an action is the only one that asks for attention. */
const LABEL: Record<TaskLetterKind, string> = {
  action: "#b45309",
  question: C.blue,
  result: C.muted,
};

/** A cell; `wrap` — only the first column wraps, the rest (sites, sums) stay on one line. */
const cell = (right: boolean, head: boolean, wrap = true) => ({
  borderBottom: `1px solid ${C.border}`,
  color: head ? C.muted : C.text,
  fontSize: head ? 12 : 14,
  fontWeight: head ? 500 : 400,
  lineHeight: "20px",
  padding: "8px 10px",
  textAlign: right ? ("right" as const) : ("left" as const),
  whiteSpace: wrap ? ("normal" as const) : ("nowrap" as const),
});

const Block = ({ b }: { b: TaskLetterBlock }) => {
  if (b.type === "p") {
    return (
      <Text
        className="t"
        style={{
          color: C.text,
          fontSize: 15,
          lineHeight: "24px",
          margin: "0 0 12px",
        }}
      >
        {b.text}
      </Text>
    );
  }
  if (b.type === "list") {
    return (
      <ol
        className="t"
        style={{
          color: C.text,
          fontSize: 15,
          lineHeight: "24px",
          margin: "0 0 12px",
          paddingLeft: 22,
        }}
      >
        {b.items.map((it) => (
          <li key={`${it.strong ?? ""}${it.text}`} style={{ marginBottom: 6 }}>
            {it.strong && <strong>{it.strong}</strong>}
            {it.strong && " — "}
            {it.text}
          </li>
        ))}
      </ol>
    );
  }
  if (b.type === "table") {
    return (
      <table
        cellPadding={0}
        cellSpacing={0}
        className="cell"
        role="presentation"
        style={{
          border: `1px solid ${C.border}`,
          borderCollapse: "separate",
          borderRadius: 10,
          margin: "0 0 12px",
          width: "100%",
        }}
      >
        <thead>
          <tr className="head" style={{ background: "#fafafa" }}>
            {b.head.map((h, i) => (
              <th
                className="m cell"
                key={h}
                style={cell(b.right?.includes(i) ?? false, true, i === 0)}
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
                  style={cell(b.right?.includes(i) ?? false, false, i === 0)}
                >
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  // Key figures side by side: React Email's Row and Column lay them out as the table mail clients need.
  return (
    <Row style={{ margin: "0 0 12px" }}>
      {b.items.map((f, i) => (
        <Column
          key={f.label}
          style={{
            paddingLeft: i ? 8 : 0,
            verticalAlign: "top",
            width: `${100 / b.items.length}%`,
          }}
        >
          <div
            className="fig"
            style={{
              background: "#fafafa",
              borderRadius: 10,
              padding: "10px 12px",
            }}
          >
            <div
              className="m"
              style={{ color: C.muted, fontSize: 12, lineHeight: "16px" }}
            >
              {f.label}
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
              {f.value}
            </div>
            {f.change && (
              <div
                className="m"
                style={{ color: C.muted, fontSize: 12, lineHeight: "16px" }}
              >
                {f.change}
              </div>
            )}
          </div>
        </Column>
      ))}
    </Row>
  );
};

const TaskLetter = ({
  locale,
  preview,
  kind,
  label,
  task,
  heading,
  blocks,
  more,
  button,
  why,
  off,
}: TaskLetterProps) => (
  <Html lang={locale}>
    <LetterHead dark={DARK} />
    <Preview>{preview}</Preview>
    <Body
      className="page"
      style={{
        background: C.page,
        fontFamily: FONT,
        margin: 0,
        padding: "32px 12px",
      }}
    >
      <Container
        className="card"
        style={{
          background: C.white,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          maxWidth: 560,
          padding: "32px 36px 28px",
        }}
      >
        <Mark />
        {/* Which task and which run: its colour, its name, the schedule and when it ran. */}
        <table
          cellPadding={0}
          cellSpacing={0}
          role="presentation"
          style={{ margin: "24px 0 0" }}
        >
          <tbody>
            <tr>
              <td
                aria-hidden="true"
                data-skip-in-text="true"
                style={{ paddingRight: 8, verticalAlign: "middle" }}
              >
                <div
                  style={{
                    background: task.color,
                    borderRadius: 5,
                    height: 10,
                    width: 10,
                  }}
                />
              </td>
              <td
                className="t"
                style={{
                  color: C.text,
                  fontSize: 14,
                  fontWeight: 600,
                  lineHeight: "20px",
                }}
              >
                {task.name}
              </td>
            </tr>
          </tbody>
        </table>
        <Text
          className="m"
          style={{
            color: C.muted,
            fontSize: 13,
            lineHeight: "20px",
            margin: "2px 0 0 18px",
          }}
        >
          {task.meta}
        </Text>
        <Text
          style={{
            color: LABEL[kind],
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.04em",
            lineHeight: "16px",
            margin: "22px 0 6px",
            textTransform: "uppercase",
          }}
        >
          {label}
        </Text>
        <Heading
          as="h1"
          className="t"
          style={{
            color: C.text,
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            lineHeight: "28px",
            margin: "0 0 14px",
          }}
        >
          {heading}
        </Heading>
        {blocks.map((b, i) => (
          <Block b={b} key={i} />
        ))}
        {more && (
          <Text
            className="m"
            style={{
              color: C.muted,
              fontSize: 13,
              lineHeight: "20px",
              margin: "0 0 4px",
            }}
          >
            {more}
          </Text>
        )}
        <Button
          href={button.href}
          style={{
            background: C.blue,
            borderRadius: 10,
            color: C.white,
            fontSize: 15,
            fontWeight: 600,
            margin: "16px 0 4px",
            padding: "13px 24px",
          }}
        >
          {button.label}
        </Button>
        <Hr
          className="cell"
          style={{ borderColor: C.border, margin: "24px 0 14px" }}
        />
        <Text
          className="m"
          style={{
            color: C.muted,
            fontSize: 12,
            lineHeight: "18px",
            margin: 0,
          }}
        >
          {why}{" "}
          <Link
            href={off.href}
            style={{ color: C.muted, textDecoration: "underline" }}
          >
            {off.label}
          </Link>
        </Text>
      </Container>
    </Body>
  </Html>
);

/** The letter's HTML and text part. */
export const taskLetter = (props: TaskLetterProps) =>
  renderLetter(<TaskLetter {...props} />);

export { TaskLetter };
