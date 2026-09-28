import type { ChatMessage } from "@metobe/contracts/chat";
import { describe, expect, it } from "vitest";

import { answeredAsk, connectionsOf } from "./connection-asks";

const ask = (state: "input-available" | "output-available", connected = true) =>
  ({
    input: { reason: "Сделки — в Битрикс24", server: "bitrix" },
    state,
    toolCallId: "call-1",
    type: "tool-request_connection",
    ...(state === "output-available" ? { output: { connected } } : {}),
  }) as ChatMessage["parts"][number];

const answer = (...parts: ChatMessage["parts"]): ChatMessage => ({
  id: "a1",
  parts,
  role: "assistant",
});

describe("an answer's «connect X to go on»", () => {
  it("carries on once the user answered the ask it ends on", () => {
    expect(
      answeredAsk([answer({ type: "step-start" }, ask("output-available"))])
    ).toBe(true);
    expect(answeredAsk([answer(ask("input-available"))])).toBe(false);
  });

  it("does not send an answer again that goes on past the ask", () => {
    expect(
      answeredAsk([
        answer(ask("output-available"), { text: "Вот сделки", type: "text" }),
      ])
    ).toBe(false);
  });

  it("sends the user's answers by tool call", () => {
    expect(connectionsOf(answer(ask("output-available", false)))).toEqual([
      { connected: false, id: "call-1" },
    ]);
    expect(connectionsOf(answer(ask("input-available")))).toEqual([]);
  });
});
