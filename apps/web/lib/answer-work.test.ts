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

const shape = (parts: Part[]) => {
  const { steps, answer } = answerWork(parts);
  return {
    answer,
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
      steps: ["tool:a"],
    });
  });
});
