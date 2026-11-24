import {
  convertToModelMessages,
  isStepCount,
  readUIMessageStream,
  streamText,
  tool,
} from "ai";
import type { ModelMessage, ToolSet } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { resumeStream } from "../../apps/web/lib/resume-stream";
import { sumUpPrompt } from "../../apps/web/lib/sum-up";
import { addCosts } from "../../packages/core/src/pricing";
import { runAnswer } from "./answer";
import type { Message } from "./answer";
import { atLeast, createBudget, stepCost } from "./budget";
import { PRICES, mockModel } from "./mock-model";
import type { Act } from "./mock-model";

// A tool whose result is long enough for the history — and so each next step — to grow, as a 1С or mail search does.
const ROWS = "строка отчёта; ".repeat(120);
const lookTools = (): ToolSet => ({
  look: tool({
    description: "Looks something up",
    execute: ({ q }) => ({ q, rows: ROWS }),
    inputSchema: z.object({ q: z.string() }),
  }),
});

const QUESTION: ModelMessage[] = [
  { content: "Сверь остатки по складу за ноябрь", role: "user" },
];

const NEVER = "1000000";

/** What each step of a script costs when nothing stops it: the yardstick the budget tests set their remainder by. */
const stepCosts = async (script: Act[], gateway: boolean) => {
  const costs: string[] = [];
  const result = streamText({
    messages: QUESTION,
    model: mockModel({ gateway, script }),
    onStepEnd: (step) => {
      costs.push(stepCost(step, gateway ? null : PRICES) as string);
    },
    stopWhen: isStepCount(100),
    tools: lookTools(),
  });
  await result.consumeStream();
  await result.steps;
  return costs;
};

const chatId = () => crypto.randomUUID();
const TOOLS_THEN_TEXT: Act[] = [
  "tool",
  "tool",
  "tool",
  "tool",
  "tool",
  "tool",
  "text",
];

describe.each([
  ["Gateway (providerMetadata.gateway.cost)", true],
  ["a source with prices (tokens × price)", false],
])("the hard stop, %s", (_name, gateway) => {
  it("stops on the step that reaches the remainder; the charge is under remainder + one step", async () => {
    const costs = await stepCosts(TOOLS_THEN_TEXT, gateway);
    // Steps grow with the history: each one dearer than the one before.
    expect(atLeast(costs[3] as string, costs[0] as string)).toBe(true);
    // The remainder runs out in the middle of the third step.
    const remaining = addCosts([
      costs[0] as string,
      costs[1] as string,
      (Number(costs[2]) / 2).toFixed(12),
    ]);
    let calls = 0;
    const budget = createBudget({
      prices: gateway ? null : PRICES,
      remaining,
    });
    const answer = await runAnswer({
      budget,
      chatId: chatId(),
      model: mockModel({
        gateway,
        onCall: () => {
          calls += 1;
        },
        script: TOOLS_THEN_TEXT,
      }),
      prices: gateway ? null : PRICES,
      messages: QUESTION,
      tools: lookTools(),
    });
    answer.forget();
    // Three calls, not seven: the third reached the remainder, the fourth never went.
    expect(calls).toBe(3);
    expect(budget.stopped()).toBe(true);
    const [run] = answer.runs;
    expect(run).toMatchObject({ pass: "answer", status: "ok", steps: 3 });
    expect(run?.cost).toBe(addCosts(costs.slice(0, 3) as string[]));
    process.stdout.write(
      `${gateway ? "gateway" : "prices"}: steps ${costs.join(" / ")}; remainder ${remaining}; charge ${run?.cost}; over by ${(Number(run?.cost) - Number(remaining)).toFixed(6)}\n`
    );
    // charge ≤ remainder + the step that crossed it
    expect(
      atLeast(addCosts([remaining, costs[2] as string]), run?.cost as string)
    ).toBe(true);
    // Stopped on a tool step: nothing said, nothing left for a sum-up — the answer ends on the line about the limit.
    expect(answer.runs.some((r) => r.pass === "sum-up")).toBe(false);
    const last = answer.saved().at(-1);
    expect(last?.parts.at(-1)).toMatchObject({
      data: { window: "five-hours" },
      type: "data-limit",
    });
    expect(last?.parts.some((p) => p.type === "text")).toBe(false);
    // `stopWhen` is asked after the step's tools ran: the crossing step's call has its result.
    const calls3 = last?.parts.filter((p) => p.type === "tool-look") ?? [];
    expect(calls3).toHaveLength(3);
    expect(
      calls3.every((p) => "state" in p && p.state === "output-available")
    ).toBe(true);
  });
});

describe("what the steps cost is written when the answer fails or is stopped", () => {
  it("a provider call that rejects: onError has no steps, onStepEnd kept them", async () => {
    const costs = await stepCosts(TOOLS_THEN_TEXT, true);
    const budget = createBudget({ prices: null, remaining: NEVER });
    const answer = await runAnswer({
      budget,
      chatId: chatId(),
      model: mockModel({ gateway: true, script: ["tool", "tool", "throw"] }),
      prices: null,
      messages: QUESTION,
      tools: lookTools(),
    });
    answer.forget();
    expect(answer.runs).toEqual([
      {
        cost: addCosts(costs.slice(0, 2) as string[]),
        pass: "answer",
        status: "error",
        steps: 2,
      },
    ]);
  });

  it("a provider `error` chunk: the step still ends with usage and its cost — counted", async () => {
    const costs = await stepCosts(["tool", "tool", "text"], true);
    const budget = createBudget({ prices: null, remaining: NEVER });
    const answer = await runAnswer({
      budget,
      chatId: chatId(),
      model: mockModel({
        gateway: true,
        script: ["tool", "tool", "error-chunk"],
      }),
      prices: null,
      messages: QUESTION,
      tools: lookTools(),
    });
    answer.forget();
    // One row: the SDK fires onError and onEnd here, the route as it is would write two.
    expect(answer.runs).toEqual([
      {
        cost: addCosts(costs.slice(0, 3) as string[]),
        pass: "answer",
        status: "error",
        steps: 3,
      },
    ]);
  });

  it("a stream that breaks off: the broken step has no usage — only the finished ones are counted", async () => {
    const costs = await stepCosts(TOOLS_THEN_TEXT, true);
    const budget = createBudget({ prices: null, remaining: NEVER });
    const answer = await runAnswer({
      budget,
      chatId: chatId(),
      model: mockModel({ gateway: true, script: ["tool", "tool", "break"] }),
      prices: null,
      messages: QUESTION,
      tools: lookTools(),
    });
    answer.forget();
    expect(answer.runs).toEqual([
      {
        cost: addCosts(costs.slice(0, 2) as string[]),
        pass: "answer",
        status: "error",
        steps: 2,
      },
    ]);
  });

  it("«stop» in the middle: onAbort gives the finished steps, the same sum as onStepEnd", async () => {
    const costs = await stepCosts(TOOLS_THEN_TEXT, true);
    const controller = new AbortController();
    const budget = createBudget({ prices: null, remaining: NEVER });
    const answer = await runAnswer({
      abortSignal: controller.signal,
      budget,
      chatId: chatId(),
      model: mockModel({
        gateway: true,
        onCall: (n) => {
          if (n === 2) {
            controller.abort();
          }
        },
        script: TOOLS_THEN_TEXT,
      }),
      prices: null,
      messages: QUESTION,
      tools: lookTools(),
    });
    answer.forget();
    expect(answer.runs).toEqual([
      {
        cost: addCosts(costs.slice(0, 2) as string[]),
        pass: "answer",
        status: "aborted",
        steps: 2,
      },
    ]);
  });
});

describe("the line about the limit", () => {
  it("is saved with the answer, and a reloaded page gets the same from resume", async () => {
    const id = chatId();
    const budget = createBudget({ prices: null, remaining: "0.0000001" });
    const answer = await runAnswer({
      budget,
      chatId: id,
      model: mockModel({ gateway: true, script: TOOLS_THEN_TEXT }),
      prices: null,
      messages: QUESTION,
      tools: lookTools(),
    });
    // The page reloaded before the answer is saved joins the record of the stream (D5).
    const stream = resumeStream(id);
    expect(stream).not.toBeNull();
    let resumed: Message | undefined;
    for await (const m of readUIMessageStream<Message>({
      stream: stream as ReadableStream,
    })) {
      resumed = m;
    }
    answer.forget();
    const saved = answer.saved().at(-1);
    const limitOf = (m?: Message) =>
      m?.parts.find((p) => p.type === "data-limit");
    expect(limitOf(saved)).toEqual(limitOf(resumed));
    expect(limitOf(resumed)).toMatchObject({ data: { window: "five-hours" } });
    // The same parts in the same order: what the page shows after a reload is what the saved answer shows.
    expect(resumed?.parts.map((p) => p.type)).toEqual(
      saved?.parts.map((p) => p.type)
    );
    // The model never reads it: a data part is dropped on the way to the model.
    const forModel = await convertToModelMessages(answer.saved());
    expect(JSON.stringify(forModel)).not.toContain("five-hours");
  });
});

describe("the soft way: the step that would reach the budget answers without tools", () => {
  it("ends in words in the same pass, no sum-up; still under remainder + one step", async () => {
    const costs = await stepCosts(TOOLS_THEN_TEXT, true);
    const remaining = addCosts([
      costs[0] as string,
      costs[1] as string,
      (Number(costs[2]) / 2).toFixed(12),
    ]);
    const budget = createBudget({ prices: null, remaining });
    let calls = 0;
    const answer = await runAnswer({
      budget,
      chatId: chatId(),
      model: mockModel({
        gateway: true,
        onCall: () => {
          calls += 1;
        },
        script: TOOLS_THEN_TEXT,
      }),
      prices: null,
      messages: QUESTION,
      soft: true,
      tools: lookTools(),
    });
    answer.forget();
    process.stdout.write(
      `soft: remainder ${remaining}; charge ${answer.runs[0]?.cost}; over by ${(Number(answer.runs[0]?.cost) - Number(remaining)).toFixed(6)}\n`
    );
    // Step 2 sees 1 + 2 + (≥ step 2) over the remainder: step 3 goes without tools and answers.
    expect(calls).toBe(3);
    const last = answer.saved().at(-1);
    const types = last?.parts.map((p) => p.type) ?? [];
    expect(types.at(-2)).toBe("text");
    expect(types.at(-1)).toBe("data-limit");
    expect(answer.runs).toHaveLength(1);
    const [run] = answer.runs;
    expect(
      atLeast(addCosts([remaining, costs[2] as string]), run?.cost as string)
    ).toBe(true);
    // The answering step costs more than the tool step it replaces: its words are longer (150 vs 60 tokens).
    expect(
      atLeast(run?.cost as string, addCosts(costs.slice(0, 3) as string[]))
    ).toBe(true);
  });
});

describe("approvals", () => {
  const sendTools = (sent: string[]): ToolSet => ({
    send: tool({
      description: "Sends a mail",
      execute: ({ q }) => {
        sent.push(q);
        return { ok: true };
      },
      inputSchema: z.object({ q: z.string() }),
      needsApproval: true,
    }),
  });

  it("a stop on the step that asks: the card stays, then the line; carried on at 0 left the tool still runs", async () => {
    const sent: string[] = [];
    const budget = createBudget({ prices: null, remaining: "0.0000001" });
    const first = await runAnswer({
      budget,
      chatId: chatId(),
      model: mockModel({
        gateway: true,
        script: ["tool", "text"],
        tool: "send",
      }),
      prices: null,
      messages: QUESTION,
      tools: sendTools(sent),
    });
    first.forget();
    const asked = first.saved().at(-1) as Message;
    const types = asked.parts.map((p) => p.type);
    expect(types).toContain("tool-send");
    expect(types.at(-1)).toBe("data-limit");
    const card = asked.parts.find((p) => p.type === "tool-send") as {
      state: string;
      approval: { id: string };
    };
    expect(card.state).toBe("approval-requested");
    expect(sent).toEqual([]);

    // The user approves. Without a check before the request the carried-on answer runs at «0 left»:
    // `stopWhen` is asked only after a step, so the approved tool runs and one more paid step goes.
    const approved: Message = {
      ...asked,
      parts: asked.parts.map((p) =>
        p.type === "tool-send"
          ? ({
              ...p,
              approval: { approved: true, id: card.approval.id },
              state: "approval-responded",
            } as typeof p)
          : p
      ),
    };
    let calls = 0;
    const again = createBudget({ prices: null, remaining: "0" });
    const carried = await runAnswer({
      budget: again,
      chatId: chatId(),
      messages: await convertToModelMessages([
        { id: "q", parts: [{ text: "Отправь", type: "text" }], role: "user" },
        approved,
      ]),
      model: mockModel({
        gateway: true,
        onCall: () => {
          calls += 1;
        },
        script: ["text"],
        tool: "send",
      }),
      originalMessages: [approved],
      prices: null,
      tools: sendTools(sent),
    });
    carried.forget();
    expect(sent).toHaveLength(1);
    expect(calls).toBe(1);
    // The step answered in words: the loop ended by itself and `stopWhen` was never asked — over, not stopped.
    expect(again.over()).toBe(true);
    expect(again.stopped()).toBe(false);
    // The same message goes on: the old line stays in its middle, above the words written after it.
    const parts =
      carried
        .saved()
        .at(-1)
        ?.parts.map((p) => p.type) ?? [];
    expect(parts.filter((t) => t === "data-limit")).toHaveLength(1);
    expect(parts.indexOf("data-limit")).toBeLessThan(parts.lastIndexOf("text"));
  });
});

describe("the sum-up pass", () => {
  it("needs `responseMessages`: `response.messages` is the last step's only (the route passes that)", async () => {
    const work = streamText({
      messages: QUESTION,
      model: mockModel({ gateway: true, script: ["tool"] }),
      stopWhen: isStepCount(3),
      tools: lookTools(),
    });
    await work.consumeStream();
    const last = (await work.response).messages;
    const all = await work.responseMessages;
    // Three steps: three calls with their results — the deprecated `response` keeps the third only.
    expect(all).toHaveLength(6);
    expect(last).toHaveLength(2);
    expect(JSON.stringify(last)).not.toContain("call-0");
  });

  it("never runs after the hard stop: by then nothing is left", () => {
    const budget = createBudget({ prices: null, remaining: "0.01" });
    budget.onStepEnd({
      providerMetadata: { gateway: { cost: "0.012" } },
      usage: {} as never,
    });
    expect(budget.left()).toBe("0");
  });

  it("costs about one more step: the whole history in, a short answer out", async () => {
    const rows: string[] = [];
    for (const k of [3, 10, 20]) {
      const steps: string[] = [];
      const work = streamText({
        messages: QUESTION,
        model: mockModel({ gateway: true, script: ["tool"] }),
        onStepEnd: (step) => {
          steps.push(stepCost(step, null) as string);
        },
        stopWhen: isStepCount(k),
        tools: lookTools(),
      });
      await work.consumeStream();
      const messages = await work.responseMessages;
      let sumUp = "";
      const pass = streamText({
        ...sumUpPrompt("", [...QUESTION, ...messages]),
        model: mockModel({ gateway: true, script: ["text"] }),
        onStepEnd: (step) => {
          sumUp = stepCost(step, null) as string;
        },
      });
      await pass.consumeStream();
      await pass.steps;
      const total = addCosts(steps);
      const lastStep = steps.at(-1) as string;
      rows.push(
        `| ${k} | ${Number(total).toFixed(4)} | ${Number(lastStep).toFixed(4)} | ${Number(sumUp).toFixed(4)} | ${(Number(sumUp) / Number(lastStep)).toFixed(2)} | ${((Number(sumUp) / Number(total)) * 100).toFixed(0)}% |`
      );
      // About one more step: its input is the history the last step had, plus that step's own call and result.
      expect(Number(sumUp) / Number(lastStep)).toBeGreaterThan(0.9);
      expect(Number(sumUp) / Number(lastStep)).toBeLessThan(2);
    }
    process.stdout.write(
      `${[
        "| шагов работы | работа, $ | последний шаг, $ | итог, $ | итог / последний шаг | итог / работа |",
        "|---|---|---|---|---|---|",
        ...rows,
      ].join("\n")}\n`
    );
  });
});
