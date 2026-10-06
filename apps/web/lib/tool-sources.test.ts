import type { ChatMessage } from "@metobe/contracts/chat";
import { convertToModelMessages, generateText, isStepCount, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { chartTool } from "./chart-tool";
import { mcpResult, salesQuery } from "./fixtures/query-result";
import { tableTool } from "./table-tool";
import { createSources, shareResults } from "./tool-sources";

const usage = {
  inputTokens: {
    cacheRead: undefined,
    cacheWrite: undefined,
    noCache: 1,
    total: 1,
  },
  outputTokens: { reasoning: undefined, text: 1, total: 1 },
};

const call = (toolName: string, input: unknown, id: string) => ({
  content: [
    {
      input: JSON.stringify(input),
      toolCallId: id,
      toolName,
      type: "tool-call" as const,
    },
  ],
  finishReason: { raw: undefined, unified: "tool-calls" as const },
  usage,
  warnings: [],
});

const say = (text: string) => ({
  content: [{ text, type: "text" as const }],
  finishReason: { raw: undefined, unified: "stop" as const },
  usage,
  warnings: [],
});

/** A model that does what the steps say, one request after another. */
const scripted = (
  steps: (ReturnType<typeof call> | ReturnType<typeof say>)[]
) => {
  const queue = [...steps];
  return new MockLanguageModelV4({
    doGenerate: () => Promise.resolve(queue.shift() ?? say("")),
  });
};

/** An MCP tool as the SDK makes it: its own `toModelOutput` turns the content into media parts the budget cannot read. */
const queryTool = (result: unknown) =>
  tool({
    execute: () => Promise.resolve(result),
    inputSchema: z.object({}),
    toModelOutput: () => ({
      type: "content",
      value: [{ text: "THE RAW CONTENT", type: "text" }],
    }),
  });

/** What the model was sent as the result of tool call `id`, in the request it made after it. */
const toldOf = (model: MockLanguageModelV4, id: string) => {
  for (const request of model.doGenerateCalls) {
    for (const message of request.prompt) {
      if (message.role !== "tool") {
        continue;
      }
      for (const part of message.content) {
        if (part.type === "tool-result" && part.toolCallId === id) {
          return part.output as { type: string; value: unknown };
        }
      }
    }
  }
  return null;
};

describe("a chart from a tool result, through a whole answer (S5)", () => {
  it("tells the model a summary on the next step, keeps the whole result, and draws the tool's numbers", async () => {
    const sources = createSources([]);
    const result = salesQuery(300);
    const tools = {
      ...shareResults({ one_run_query: queryTool(result) }, sources),
      show_chart: chartTool(sources),
    };
    const steps = [
      call("one_run_query", {}, "q1"),
      call(
        "show_chart",
        {
          from: { bucket: "month", x: "Дата" },
          kind: "area",
          series: [{ field: "Выручка", label: "Выручка" }],
          title: "Выручка по месяцам",
          x: { label: "Месяц", type: "date" },
        },
        "c1"
      ),
      say("Выручка растёт."),
    ];
    const model = scripted(steps);
    const answer = await generateText({
      messages: [{ content: "Покажи выручку по месяцам", role: "user" }],
      model,
      stopWhen: isStepCount(5),
      tools,
    });

    // The model's second request carries the summary, not 300 rows and not the SDK's raw content.
    const told = toldOf(model, "q1");
    expect(told?.type).toBe("text");
    expect(String(told?.value)).toContain("ref q1");
    expect(String(told?.value)).toContain("Выручка (number; sum 74850");
    expect(String(told?.value)).not.toContain("Товар 100");
    expect(JSON.stringify(told)).not.toContain("THE RAW CONTENT");

    // The tool result itself is whole.
    const queried = answer.steps[0]?.toolResults[0]?.output;
    expect(JSON.stringify(queried)).toContain("Товар 299");

    // The chart's points are the tool's: they add up to the whole of its revenue.
    const drawn = answer.steps[1]?.toolResults[0]?.output as {
      data: [string, number][];
      points: number;
    };
    expect(drawn.points).toBe(3);
    expect(drawn.data.reduce((sum, p) => sum + p[1], 0)).toBe(74_850);

    // And the model is told how many, with the values (a short chart), to speak of them.
    const toldOfChart = toldOf(model, "c1");
    expect(String(toldOfChart?.value)).toContain("3 points");
    expect(String(toldOfChart?.value)).toContain("2026-01-01");
  });

  it("does not turn a result that is no table into anything but its JSON", async () => {
    const sources = createSources([]);
    const tools = shareResults(
      {
        one_describe: queryTool(
          mcpResult({ attributes: ["a", "b"], name: "x" })
        ),
      },
      sources
    );
    const model = scripted([call("one_describe", {}, "d1"), say("ok")]);
    await generateText({
      messages: [{ content: "?", role: "user" }],
      model,
      stopWhen: isStepCount(3),
      tools,
    });
    expect(toldOf(model, "d1")?.type).toBe("json");
  });

  it("answers a wrong ref or an unknown column with what there is, as an error the model reads", async () => {
    const sources = createSources([]);
    const tools = {
      ...shareResults({ one_run_query: queryTool(salesQuery(40)) }, sources),
      show_table: tableTool(sources),
    };
    const columns = [{ field: "Прибыль", label: "Прибыль", type: "number" }];
    const steps = [
      call("one_run_query", {}, "q1"),
      call("show_table", { columns, from: { ref: "nope" }, title: "t" }, "t1"),
      call("show_table", { columns, from: { ref: "q1" }, title: "t" }, "t2"),
      say("ok"),
    ];
    const model = scripted(steps);
    await generateText({
      messages: [{ content: "?", role: "user" }],
      model,
      stopWhen: isStepCount(6),
      tools,
    });
    expect(String(toldOf(model, "t1")?.value)).toContain(
      'no table result with ref "nope"'
    );
    expect(String(toldOf(model, "t1")?.value)).toContain("q1");
    expect(String(toldOf(model, "t2")?.value)).toContain('no column "Прибыль"');
  });
});

const history = (): ChatMessage[] => [
  {
    id: "a1",
    parts: [
      {
        input: {},
        output: salesQuery(300),
        state: "output-available",
        toolCallId: "old1",
        toolName: "one_run_query",
        type: "dynamic-tool",
      },
    ],
    role: "assistant",
  },
];

describe("the results the history keeps", () => {
  it("a later question charts an earlier result without asking the tool again", () => {
    const sources = createSources(history());
    expect(sources.resolve().ref).toBe("old1");
    expect(sources.resolve("old1").table.rows).toHaveLength(300);
  });

  it("tells the model the summary of an old result too, from the stored history", async () => {
    const sources = createSources(history());
    const tools = shareResults({ one_run_query: queryTool(null) }, sources);
    const messages = await convertToModelMessages(history(), { tools });
    const [part] = messages.flatMap((m) =>
      m.role === "tool" ? m.content : []
    );
    expect(part?.type === "tool-result" && part.output.type).toBe("text");
    expect(JSON.stringify(part)).toContain("ref old1");
  });

  it("says there is nothing to take when the chat has no table", () => {
    expect(() => createSources([]).resolve()).toThrow(
      /no table-like tool result/u
    );
  });
});
