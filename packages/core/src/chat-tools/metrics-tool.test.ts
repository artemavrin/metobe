import { generateText, isStepCount, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { mcpResult } from "./fixtures/query-result";
import { metricsTool } from "./metrics-tool";
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

describe("show_metrics through a whole answer", () => {
  it("computes the figures from the tool's result and tells the model them in words", async () => {
    const rows = Array.from({ length: 60 }, (_, i) => [
      `2026-0${1 + (i % 3)}-10`,
      `Клиент ${i % 4}`,
      100 + i,
    ]);
    const sources = createSources([]);
    const tools = {
      ...shareResults(
        {
          one_run_query: tool({
            execute: () =>
              Promise.resolve(
                mcpResult({ columns: ["Дата", "Клиент", "Выручка"], rows })
              ),
            inputSchema: z.object({}),
          }),
        },
        sources
      ),
      show_metrics: metricsTool(sources),
    };
    const steps = [
      call("one_run_query", {}, "q1"),
      call(
        "show_metrics",
        {
          items: [
            {
              field: "Выручка",
              form: "trend",
              label: "Выручка",
              unit: "₽",
              x: "Дата",
            },
            {
              aggregate: "distinct",
              field: "Клиент",
              form: "value",
              label: "Клиентов",
            },
          ],
          title: "Ключевые показатели",
        },
        "m1"
      ),
      say("Готово."),
    ];
    const queue = [...steps];
    const model = new MockLanguageModelV4({
      doGenerate: () => Promise.resolve(queue.shift() ?? say("")),
    });
    const answer = await generateText({
      messages: [{ content: "Покажи показатели", role: "user" }],
      model,
      stopWhen: isStepCount(5),
      tools,
    });
    const out = answer.steps[1]?.toolResults[0]?.output as {
      items: { series: { value: number }[]; value: number }[];
      rows: number;
    };
    // The sum of the whole of the result: 100 + 101 + … + 159.
    expect(out.items[0]?.value).toBe(7770);
    expect(out.items[0]?.series.reduce((a, s) => a + s.value, 0)).toBe(7770);
    expect(out.items[1]?.value).toBe(4);
    expect(out.rows).toBe(60);
    const told = JSON.stringify(model.doGenerateCalls.at(-1)?.prompt);
    expect(told).toContain("computed from 60 rows");
    expect(told).toContain("Выручка: 7770 ₽");
  });
});
