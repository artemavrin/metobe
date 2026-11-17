import type { ModelLabel, ModelPayload } from "@metobe/contracts/chat";
import { describe, expect, it } from "vitest";

import {
  LABEL_TAG,
  answerTexts,
  countHidden,
  inputText,
  labelKey,
  rehypeLabels,
  splitLabels,
  toolTexts,
  toolViews,
} from "./model-view";

const labels: ModelLabel[] = [
  { label: "Персона_Женщина_7f3a01", type: "PERSON", value: "Ольга Смирнова" },
  {
    label: "Персоне_Женщине_7f3a01",
    type: "PERSON",
    value: "Ольге Смирновой",
  },
  { label: "[[EMAIL_e1f2a3]]", type: "EMAIL", value: "o.s@example.com" },
];

describe("labels in what the model saw", () => {
  it("matches a bracket label exactly and a person by the id at its end", () => {
    expect(
      splitLabels(
        "Напиши Персоны_Женщины_7f3a01 на [[EMAIL_e1f2a3]], копию Персоне_Женщине_7f3a01.",
        labels
      )
    ).toEqual([
      "Напиши ",
      {
        key: "person:7f3a01",
        label: "Персоны_Женщины_7f3a01",
        value: "Ольга Смирнова",
      },
      " на ",
      {
        key: "[[EMAIL_e1f2a3]]",
        label: "[[EMAIL_e1f2a3]]",
        value: "o.s@example.com",
      },
      ", копию ",
      {
        key: "person:7f3a01",
        label: "Персоне_Женщине_7f3a01",
        value: "Ольге Смирновой",
      },
      ".",
    ]);
  });

  it("leaves a label the record does not know as plain text", () => {
    expect(
      splitLabels("Звонил [[PHONE_aaaaaa]] и Персона_Мужчина_14e4aa", labels)
    ).toEqual(["Звонил [[PHONE_aaaaaa]] и Персона_Мужчина_14e4aa"]);
  });

  it("counts a person once whatever case the model wrote", () => {
    expect(
      countHidden(
        [
          "Персона_Женщина_7f3a01 и Персоне_Женщине_7f3a01",
          "[[EMAIL_e1f2a3]] [[EMAIL_e1f2a3]] [[PHONE_aaaaaa]]",
        ],
        labels
      )
    ).toBe(2);
    expect(countHidden(["ничего"], labels)).toBe(0);
  });

  it("keys a person by id and anything else by itself", () => {
    expect(labelKey("персону_Мужчину_14E4AA")).toBe("person:14e4aa");
    expect(labelKey("[[EMAIL_e1f2a3]]")).toBe("[[EMAIL_e1f2a3]]");
  });
});

describe("a step of the work as the model saw it", () => {
  const payload: ModelPayload = {
    labels,
    steps: [
      {
        text: "Ищу контакт.",
        tools: [
          {
            input: '{"query":"Персона_Женщина_7f3a01"}',
            output: '{"email":"[[EMAIL_e1f2a3]]"}',
            toolCallId: "c1",
          },
          { input: "not json", toolCallId: "c2" },
        ],
      },
    ],
  };

  it("finds the calls of a step in its order and lays the input out", () => {
    const views = toolViews(payload, ["c2", "c1", "missing"]);
    expect(views.map((v) => v.toolCallId)).toEqual(["c2", "c1"]);
    expect(toolTexts(views)).toEqual([
      "not json",
      '{\n  "query": "Персона_Женщина_7f3a01"\n}',
      '{"email":"[[EMAIL_e1f2a3]]"}',
    ]);
    expect(toolViews(undefined, ["c1"])).toEqual([]);
  });

  it("keeps input that is not a string readable", () => {
    expect(inputText({ a: 1 })).toBe('{\n  "a": 1\n}');
  });
});

describe("the answer as the model wrote it", () => {
  it("takes the words after the last call of the work, split at widgets", () => {
    const payload: ModelPayload = {
      labels,
      steps: [
        { text: "Ищу.", tools: [{ toolCallId: "work" }] },
        {
          text: "Нашёл Персону_Женщину_7f3a01.",
          tools: [{ toolCallId: "table" }],
        },
        { text: "Пишите на [[EMAIL_e1f2a3]].", tools: [] },
      ],
    };
    expect(answerTexts(payload, new Set(["work"]))).toEqual([
      "Нашёл Персону_Женщину_7f3a01.",
      "Пишите на [[EMAIL_e1f2a3]].",
    ]);
  });

  it("takes every step's words when there was no work", () => {
    const payload: ModelPayload = {
      labels,
      steps: [
        { text: "Первая часть, ", tools: [] },
        { text: "вторая.", tools: [] },
      ],
    };
    expect(answerTexts(payload, new Set())).toEqual(["Первая часть, вторая."]);
    expect(answerTexts(undefined, new Set())).toEqual([]);
  });
});

describe("labels in the answer's markdown", () => {
  it("wraps labels in text, not in code", () => {
    const tree = {
      children: [
        {
          children: [
            { type: "text", value: "Привет, Персона_Женщина_7f3a01!" },
          ],
          tagName: "p",
          type: "element",
        },
        {
          children: [{ type: "text", value: "[[EMAIL_e1f2a3]]" }],
          tagName: "code",
          type: "element",
        },
      ],
      type: "root",
    };
    rehypeLabels()(tree);
    expect(tree.children[0]?.children).toEqual([
      { type: "text", value: "Привет, " },
      {
        children: [{ type: "text", value: "Персона_Женщина_7f3a01" }],
        properties: {},
        tagName: LABEL_TAG,
        type: "element",
      },
      { type: "text", value: "!" },
    ]);
    expect(tree.children[1]?.children).toEqual([
      { type: "text", value: "[[EMAIL_e1f2a3]]" },
    ]);
  });
});
