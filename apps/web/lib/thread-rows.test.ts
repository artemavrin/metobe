import type { ChatMessage } from "@metobe/contracts/chat";
import { describe, expect, it } from "vitest";

import { threadRows } from "./thread-rows";

const question: ChatMessage = {
  id: "q1",
  parts: [{ text: "Привет", type: "text" }],
  role: "user",
};
// What AI SDK puts in on the stream's `start`: the answer, still without parts.
const emptyAnswer: ChatMessage = {
  id: "a1",
  metadata: { modelId: "7d6f5a2e-2b3c-4f1a-9b8e-1c2d3e4f5a6b" },
  parts: [],
  role: "assistant",
};
const answer: ChatMessage = {
  ...emptyAnswer,
  parts: [{ text: "Здравствуйте!", type: "text" }],
};

const shape = (rows: ReturnType<typeof threadRows>) =>
  rows.map((r) =>
    r.role === "switch"
      ? { key: r.key, model: r.modelId }
      : {
          key: r.key,
          live: r.role === "assistant" ? r.live : undefined,
          message: r.message?.id,
        }
  );

const A = "7d6f5a2e-2b3c-4f1a-9b8e-1c2d3e4f5a6b";
const B = "0c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
const ask = (id: string): ChatMessage => ({ ...question, id });
const reply = (id: string, modelId?: string): ChatMessage => ({
  ...answer,
  id,
  metadata: modelId ? { modelId } : undefined,
});

describe("the thread's rows", () => {
  it("gives a question that just went a live answer to wait in", () => {
    expect(shape(threadRows([question], "submitted"))).toEqual([
      { key: "q1", live: undefined, message: "q1" },
      { key: "answer:q1", live: true, message: undefined },
    ]);
  });

  it("keeps the answer live when the stream's start puts it in while still submitted", () => {
    expect(shape(threadRows([question, emptyAnswer], "submitted"))).toEqual([
      { key: "q1", live: undefined, message: "q1" },
      { key: "answer:q1", live: true, message: "a1" },
    ]);
  });

  it("keeps one key for the answer from waiting to done", () => {
    const keys = [
      threadRows([question], "submitted"),
      threadRows([question, emptyAnswer], "submitted"),
      threadRows([question, answer], "streaming"),
      threadRows([question, answer], "ready"),
    ].map((rows) => rows.at(-1)?.key);
    expect(new Set(keys)).toEqual(new Set(["answer:q1"]));
  });

  it("lets a finished, stopped or failed answer rest", () => {
    for (const status of ["ready", "error"] as const) {
      expect(threadRows([question, answer], status).at(-1)).toMatchObject({
        live: false,
      });
    }
    expect(threadRows([question], "error")).toHaveLength(1);
  });

  it("keeps earlier answers at rest while a new one comes", () => {
    const next: ChatMessage = { ...question, id: "q2" };
    const rows = threadRows([question, answer, next], "submitted");
    expect(shape(rows)).toEqual([
      { key: "q1", live: undefined, message: "q1" },
      { key: "answer:q1", live: false, message: "a1" },
      { key: "q2", live: undefined, message: "q2" },
      { key: "answer:q2", live: true, message: undefined },
    ]);
  });
});

describe("where the model changes", () => {
  it("is marked before the question the new model answered", () => {
    const rows = threadRows(
      [ask("q1"), reply("a1", A), ask("q2"), reply("a2", B)],
      "ready"
    );
    expect(shape(rows).map((r) => r.key)).toEqual([
      "q1",
      "answer:q1",
      "switch:q2",
      "q2",
      "answer:q2",
    ]);
    expect(shape(rows)[2]).toEqual({ key: "switch:q2", model: B });
  });

  it("is not marked while the model stays, nor for the chat's first model", () => {
    const rows = threadRows(
      [ask("q1"), reply("a1", A), ask("q2"), reply("a2", A)],
      "ready"
    );
    expect(rows.some((r) => r.role === "switch")).toBe(false);
  });

  it("is marked as soon as the question goes, by the model it went to", () => {
    const rows = threadRows(
      [ask("q1"), reply("a1", A), ask("q2")],
      "submitted",
      B
    );
    expect(shape(rows).slice(2)).toEqual([
      { key: "switch:q2", model: B },
      { key: "q2", live: undefined, message: "q2" },
      { key: "answer:q2", live: true, message: undefined },
    ]);
  });

  it("is not guessed when an answer does not say its model", () => {
    const rows = threadRows(
      [ask("q1"), reply("a1"), ask("q2"), reply("a2", B)],
      "ready"
    );
    expect(rows.some((r) => r.role === "switch")).toBe(false);
  });
});
