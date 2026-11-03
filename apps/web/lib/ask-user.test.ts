import type { AskUserInput, ChatMessage } from "@metobe/contracts/chat";
import { approvalsSchema } from "@metobe/contracts/chat";
import { describe, expect, it } from "vitest";

import { answerWork } from "./answer-work";
import { applyQuestions, settleAsks } from "./approvals";
import {
  askUserModelText,
  keptAnswers,
  openQuestion,
  questionsOf,
} from "./ask-user";
import { answeredAsk } from "./connection-asks";

const PERIOD = "За какой период?";
const BY = "Разбить по…";

const input: AskUserInput = {
  questions: [
    {
      header: "Период",
      options: [{ label: "Год" }, { label: "Квартал" }],
      question: PERIOD,
    },
    {
      header: "Кому",
      multiSelect: true,
      options: [
        { label: "Опт" },
        { label: "Розница" },
        { label: "Поставщики" },
      ],
      question: BY,
    },
  ],
};

const waiting = (toolCallId: string) =>
  ({
    input,
    state: "input-available",
    toolCallId,
    type: "tool-ask_user",
  }) as ChatMessage["parts"][number];

const paused: ChatMessage = {
  id: "a1",
  parts: [
    { type: "step-start" },
    { text: "Пара вопросов, чтобы график ответил на нужное.", type: "text" },
    waiting("call-1"),
  ],
  role: "assistant",
};

describe("what the server keeps of the user's answers", () => {
  it("keeps answers to the questions asked, trimmed and without repeats", () => {
    expect(
      keptAnswers(input, {
        answers: {
          [BY]: ["Опт", " Опт ", "Поставщики"],
          [PERIOD]: [" Квартал "],
          "Не тот вопрос": ["что-то"],
        },
        id: "call-1",
        skipped: false,
      })
    ).toEqual({
      answers: { [BY]: ["Опт", "Поставщики"], [PERIOD]: ["Квартал"] },
      skipped: false,
    });
  });

  it("gives a single choice question one answer, and drops empty ones", () => {
    expect(
      keptAnswers(input, {
        answers: { [BY]: [], [PERIOD]: ["Год", "Квартал"] },
        id: "call-1",
        skipped: false,
      }).answers
    ).toEqual({ [PERIOD]: ["Год"] });
  });

  it("takes «let the model decide» as no answers at all", () => {
    expect(
      keptAnswers(input, {
        answers: { [PERIOD]: ["Год"] },
        id: "call-1",
        skipped: true,
      })
    ).toEqual({ answers: {}, skipped: true });
  });
});

describe("what the model reads back", () => {
  it("lists each question with what was said, or leaves it to the model", () => {
    expect(
      askUserModelText(input, {
        answers: { [PERIOD]: ["Квартал"] },
        skipped: false,
      })
    ).toBe(
      `The user answered:\n- ${PERIOD} → Квартал\n- ${BY} → (no answer — decide yourself)`
    );
  });

  it("says when the user left it all to the model", () => {
    expect(askUserModelText(input, { answers: {}, skipped: true })).toContain(
      "left it to you"
    );
  });
});

describe("applying the user's answers to the questions", () => {
  it("answers a waiting call once, and nothing it was not asked", () => {
    const once = applyQuestions(paused, [
      { answers: { [PERIOD]: ["Год"] }, id: "call-1", skipped: false },
    ]);
    expect(once?.parts[2]).toMatchObject({
      output: { answers: { [PERIOD]: ["Год"] }, skipped: false },
      state: "output-available",
    });
    expect(
      once &&
        applyQuestions(once, [
          { answers: { [PERIOD]: ["Квартал"] }, id: "call-1", skipped: false },
        ])
    ).toBe(null);
    expect(
      applyQuestions(paused, [{ answers: {}, id: "made-up", skipped: true }])
    ).toBe(null);
  });

  it("takes questions passed by with a new message as left to the model", () => {
    expect(settleAsks(paused).parts[2]).toMatchObject({
      output: { answers: {}, skipped: true },
      state: "output-available",
    });
  });
});

describe("the chat around the questions", () => {
  const answered = applyQuestions(paused, [
    { answers: { [PERIOD]: ["Год"] }, id: "call-1", skipped: false },
  ]) as ChatMessage;

  it("finds the questions still waiting, and none once answered", () => {
    expect(openQuestion(paused)?.toolCallId).toBe("call-1");
    expect(openQuestion(answered)).toBe(null);
  });

  it("carries the answer on by itself once the user answered", () => {
    expect(answeredAsk([paused])).toBe(false);
    expect(answeredAsk([answered])).toBe(true);
  });

  it("sends the answers the request checks", () => {
    const request = {
      answers: [],
      connections: [],
      messageId: "00000000-0000-4000-8000-000000000001",
      questions: questionsOf(answered),
    };
    expect(approvalsSchema.safeParse(request).success).toBe(true);
    expect(request.questions).toEqual([
      { answers: { [PERIOD]: ["Год"] }, id: "call-1", skipped: false },
    ]);
  });

  it("draws the questions in the answer, not in its work", () => {
    const { blocks, steps } = answerWork(answered.parts);
    expect(steps).toEqual([]);
    expect(blocks.map((b) => b.kind)).toEqual(["text", "ask"]);
  });
});
