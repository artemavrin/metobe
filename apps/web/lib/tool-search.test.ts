import { generateText, isStepCount, tool } from "ai";
import type { ToolSet } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  FIND_TOOLS,
  NAMES_LISTED_UP_TO,
  ON_DEMAND_AFTER,
  lendTools,
  servicesNote,
  topicsOf,
} from "./tool-search";

const usage = {
  inputTokens: {
    cacheRead: undefined,
    cacheWrite: undefined,
    noCache: 1,
    total: 1,
  },
  outputTokens: { reasoning: undefined, text: 1, total: 1 },
};

const calls: string[] = [];
const named = (names: string[]): ToolSet =>
  Object.fromEntries(
    names.map((name) => [
      name,
      tool({
        description: `Does ${name.replaceAll("_", " ")}.`,
        execute: () => {
          calls.push(name);
          return { ok: true };
        },
        inputSchema: z.object({}),
      }),
    ])
  );

// A big server (more tools than lent at once) and a small one.
const bigNames = [
  "bitrix_create_deal",
  "bitrix_deal_stage_list",
  "bitrix_lead_stage_list",
  ...Array.from({ length: ON_DEMAND_AFTER }, (_, i) => `bitrix_task_${i}`),
];
const big = {
  description: "CRM компании — сделки и задачи",
  key: "bitrix",
  title: "Битрикс",
  tools: named(bigNames),
};
const small = {
  description: null,
  key: "notes",
  title: "Заметки",
  tools: named(["notes_read"]),
};

const namesSent = (call: { tools?: { name: string }[] }) =>
  (call.tools ?? []).map((t) => t.name);

describe("what a server's tools are about", () => {
  it("counts the words of the names, leaving out what a tool does", () => {
    expect(
      topicsOf([
        "create_deal",
        "deal_stage_list",
        "lead_stage_list",
        "getDealById",
      ])
    ).toEqual(["deal", "stage", "lead", "id"]);
    // Verbs and little words are not what the tools are about.
    expect(
      topicsOf(["move_task_from_stage", "check_task", "search_employee"])
    ).toEqual(["task", "stage", "employee"]);
  });
});

describe("a big server's tools on demand", () => {
  it("lends a big server's tools and keeps a small one's, adding the search only when something is lent", () => {
    const tools = lendTools([big, small], new Set());
    expect(tools.bitrix_create_deal?.deferLoading).toBe(true);
    expect(tools.notes_read?.deferLoading).toBeUndefined();
    expect(tools[FIND_TOOLS]?.description).toContain(
      "Битрикс (CRM компании — сделки и задачи) — 15 tools named bitrix_…"
    );
    expect(lendTools([small], new Set())[FIND_TOOLS]).toBeUndefined();
  });

  it("lists a lent server's tool names up to a few dozen, the words of them beyond", () => {
    expect(lendTools([big], new Set())[FIND_TOOLS]?.description).toContain(
      "15 tools named bitrix_…: bitrix_create_deal, bitrix_deal_stage_list"
    );
    const huge = {
      ...big,
      tools: named(
        Array.from(
          { length: NAMES_LISTED_UP_TO + 1 },
          (_, i) => `bitrix_deal_${i}`
        )
      ),
    };
    const description = lendTools([huge], new Set())[FIND_TOOLS]?.description;
    expect(description).toContain("mostly about deal");
    expect(description).not.toContain("bitrix_deal_0");
  });

  it("loads at once the tools the thread has already called", () => {
    const tools = lendTools([big], new Set(["bitrix_create_deal"]));
    expect(tools.bitrix_create_deal?.deferLoading).toBeUndefined();
    expect(tools.bitrix_task_0?.deferLoading).toBe(true);
  });

  it("shows the model only the search, then what it found, and runs the found tool", async () => {
    calls.length = 0;
    const model = new MockLanguageModelV4({
      doGenerate: [
        {
          content: [
            {
              input: JSON.stringify({ query: "create deal" }),
              toolCallId: "s1",
              toolName: FIND_TOOLS,
              type: "tool-call",
            },
          ],
          finishReason: { raw: undefined, unified: "tool-calls" },
          usage,
          warnings: [],
        },
        {
          content: [
            {
              input: "{}",
              toolCallId: "c1",
              toolName: "bitrix_create_deal",
              type: "tool-call",
            },
          ],
          finishReason: { raw: undefined, unified: "tool-calls" },
          usage,
          warnings: [],
        },
        {
          content: [{ text: "Готово.", type: "text" }],
          finishReason: { raw: undefined, unified: "stop" },
          usage,
          warnings: [],
        },
      ],
    });
    const result = await generateText({
      model,
      prompt: "создай сделку",
      stopWhen: isStepCount(5),
      tools: lendTools([big, small], new Set()),
    });
    const [first, second] = model.doGenerateCalls;
    expect(namesSent(first ?? {})).toEqual(["notes_read", FIND_TOOLS]);
    expect(namesSent(second ?? {})).toContain("bitrix_create_deal");
    expect(namesSent(second ?? {})).not.toContain("bitrix_task_0");
    expect(calls).toEqual(["bitrix_create_deal"]);
    expect(result.text).toBe("Готово.");
  });
});

describe("what the model is told of the chat's services", () => {
  it("names each by its prefix with the admin's word, and where a big one's tools are found", () => {
    expect(servicesNote([big, small])).toBe(
      [
        "MCP services connected in this chat:",
        `- Битрикс (tools named bitrix_…): CRM компании — сделки и задачи. Its tools are found with ${FIND_TOOLS}.`,
        "- Заметки (tools named notes_…)",
      ].join("\n")
    );
  });

  it("says nothing without servers", () => {
    expect(servicesNote([])).toBeUndefined();
  });
});
