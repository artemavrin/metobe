import { describe, expect, it, vi } from "vitest";

import type { MaskedCall, ModelAnswer } from "./pii-guard";

vi.mock("server-only", () => ({}));

const { buildPayloads } = await import("./model-payloads");

// All people and addresses are fictional.
const entities = [
  {
    placeholder: "Персоне_Женщине_ab12cd",
    type: "PERSON",
    value: "Смирновой Ольге Петровне",
  },
  { placeholder: "[[EMAIL_e1f2a3]]", type: "EMAIL", value: "olga@example.com" },
];

const call = (prompt: unknown[]): MaskedCall =>
  ({ entities, messages: [], ms: 1, prompt }) as unknown as MaskedCall;

const asked = {
  content: [{ text: "Напиши Персоне_Женщине_ab12cd", type: "text" }],
  role: "user",
};

describe("buildPayloads", () => {
  it("is nothing when no call was masked", () => {
    expect(buildPayloads([], [])).toBeNull();
  });

  it("keeps the question as it went and each step with its tool exchange", () => {
    const calls = [
      call([{ content: "Ты помощник.", role: "system" }, asked]),
      call([
        asked,
        {
          content: [
            {
              input: { to: "[[EMAIL_e1f2a3]]" },
              toolCallId: "c1",
              toolName: "send",
              type: "tool-call",
            },
          ],
          role: "assistant",
        },
        {
          content: [
            {
              output: {
                type: "json",
                value: { ok: true, to: "[[EMAIL_e1f2a3]]" },
              },
              toolCallId: "c1",
              toolName: "send",
              type: "tool-result",
            },
          ],
          role: "tool",
        },
      ]),
    ];
    const answers: ModelAnswer[] = [
      {
        text: "",
        toolCalls: [
          {
            input: '{"to":"[[EMAIL_e1f2a3]]"}',
            toolCallId: "c1",
            toolName: "send",
          },
        ],
      },
      { text: "Написал Персоне_Женщине_ab12cd.", toolCalls: [] },
    ];
    const built = buildPayloads(calls, answers);
    expect(built?.question?.text).toBe("Напиши Персоне_Женщине_ab12cd");
    expect(built?.answer.steps).toEqual([
      {
        text: undefined,
        tools: [
          {
            input: '{"to":"[[EMAIL_e1f2a3]]"}',
            output: '{"ok":true,"to":"[[EMAIL_e1f2a3]]"}',
            toolCallId: "c1",
          },
        ],
      },
      { text: "Написал Персоне_Женщине_ab12cd.", tools: [] },
    ]);
    expect(built?.answer.labels.map((l) => l.type)).toEqual([
      "PERSON",
      "EMAIL",
    ]);
  });
});
