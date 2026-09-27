import type { ChatMessage } from "@metobe/contracts/chat";
import { describe, expect, it } from "vitest";

import { answerWork } from "./answer-work";

type Part = ChatMessage["parts"][number];
const text = (t: string): Part => ({ text: t, type: "text" });
const thought = (t: string): Part => ({ text: t, type: "reasoning" });
const call = (id: string, name: string): Part =>
  ({
    input: {},
    output: { content: [] },
    state: "output-available",
    toolCallId: id,
    toolName: name,
    type: "dynamic-tool",
  }) as Part;

const table = (id: string): Part =>
  ({
    input: { columns: [], rows: [], title: "t" },
    output: { rows: 0 },
    state: "output-available",
    toolCallId: id,
    type: "tool-show_table",
  }) as Part;

const chart = (id: string): Part =>
  ({
    input: {
      kind: "bar",
      points: [],
      series: [],
      title: "c",
      x: { label: "x", type: "category" },
    },
    output: { points: 0 },
    state: "output-available",
    toolCallId: id,
    type: "tool-show_chart",
  }) as Part;

const shape = (parts: Part[]) => {
  const { steps, answer, blocks } = answerWork(parts);
  return {
    answer,
    blocks: blocks.map((b) =>
      b.kind === "text" ? "text" : `${b.kind}:${b.key}`
    ),
    steps: steps.map((s) =>
      s.kind === "tool"
        ? `tool:${s.calls.map((c) => c.toolCallId).join("+")}`
        : `${s.kind}:${s.text}`
    ),
  };
};

describe("an answer's work and its answer", () => {
  it("keeps an answer without tools as it is: no work", () => {
    expect(shape([thought("hm"), text("Привет")])).toEqual({
      answer: "Привет",
      blocks: ["text"],
      steps: [],
    });
  });

  it("puts everything up to the last tool call into the work, the text after it is the answer", () => {
    expect(
      shape([
        thought("надо посмотреть"),
        call("a", "kaskad_get_base_info"),
        text("Посчитаю их количество."),
        call("b", "kaskad_count_rows"),
        thought("736, проверю уволенных"),
        text("Всего 736 записей."),
      ])
    ).toEqual({
      answer: "Всего 736 записей.",
      blocks: ["text"],
      steps: [
        "thought:надо посмотреть",
        "tool:a",
        "note:Посчитаю их количество.",
        "tool:b",
        "thought:736, проверю уволенных",
      ],
    });
  });

  it("folds the same tool called in a row into one step", () => {
    expect(
      shape([
        call("a", "kaskad_list_metadata"),
        call("b", "kaskad_list_metadata"),
        call("c", "kaskad_run_query"),
        text("Готово"),
      ]).steps
    ).toEqual(["tool:a+b", "tool:c"]);
  });

  it("has no answer yet while the work goes on", () => {
    expect(shape([call("a", "x_y"), text("  ")])).toEqual({
      answer: "",
      blocks: [],
      steps: ["tool:a"],
    });
  });

  it("puts a chart into the answer too, in its place among the words", () => {
    expect(
      shape([
        call("a", "kaskad_run_query"),
        text("Вот выручка."),
        chart("c"),
        table("t"),
        text("Рост с марта."),
      ])
    ).toEqual({
      answer: "Вот выручка.\n\nРост с марта.",
      blocks: ["text", "chart:c", "table:t", "text"],
      steps: ["tool:a"],
    });
  });

  it("puts a table into the answer, not the work — with tools or without", () => {
    expect(
      shape([
        call("a", "kaskad_run_query"),
        text("Вот сотрудники."),
        table("t"),
        text("Больше всего — в Москве."),
      ])
    ).toEqual({
      answer: "Вот сотрудники.\n\nБольше всего — в Москве.",
      blocks: ["text", "table:t", "text"],
      steps: ["tool:a"],
    });
    expect(shape([thought("hm"), table("t")])).toEqual({
      answer: "",
      blocks: ["table:t"],
      steps: [],
    });
  });
});
