import { generateText, isStepCount } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const files: Record<string, unknown> = {
  "code.png": {
    bytes: PNG,
    description: null,
    kind: "binary",
    mediaType: "image/png",
    skillId: "s",
  },
  "notes.zip": {
    bytes: new Uint8Array([1]),
    description: null,
    kind: "binary",
    mediaType: "application/zip",
    skillId: "s",
  },
  "scripts/check.py": { content: "print(1)", kind: "text" },
};
const kept: string[] = [];
const created: unknown[][] = [];
let createResult: unknown = { id: "n", ok: true, replaced: false };
vi.mock("@metobe/core/skills", () => ({
  createSkill: (...args: unknown[]) => {
    created.push(args);
    return Promise.resolve(createResult);
  },
  keepSkillFileDescription: (_id: string, path: string, text: string) => {
    kept.push(`${path}:${text}`);
    return Promise.resolve();
  },
  loadSkill: () => Promise.resolve(null),
  readSkillFile: (_u: string, _n: string, path: string) =>
    Promise.resolve(files[path] ?? null),
}));
vi.mock("@metobe/core/vision", () => ({
  describeImage: () => Promise.resolve({ text: "Код склада: K-4217" }),
}));

const { READ_SKILL_FILE, SAVE_SKILL, skillTools, skillsNote, skillsOfChat } =
  await import("./skill-tools");

const usage = {
  inputTokens: {
    cacheRead: undefined,
    cacheWrite: undefined,
    noCache: 1,
    total: 1,
  },
  outputTokens: { reasoning: undefined, text: 1, total: 1 },
};

/** Reads one file of the skill through a whole answer and returns what the model was then sent of it. */
const told = async (path: string, vision: boolean) => {
  const queue = [
    {
      content: [
        {
          input: JSON.stringify({ name: "zz", path }),
          toolCallId: "r1",
          toolName: READ_SKILL_FILE,
          type: "tool-call" as const,
        },
      ],
      finishReason: { raw: undefined, unified: "tool-calls" as const },
      usage,
      warnings: [],
    },
    {
      content: [{ text: "ok", type: "text" as const }],
      finishReason: { raw: undefined, unified: "stop" as const },
      usage,
      warnings: [],
    },
  ];
  const model = new MockLanguageModelV4({
    doGenerate: () => Promise.resolve(queue.shift() ?? queue[0]),
  });
  const answer = await generateText({
    messages: [{ content: "?", role: "user" }],
    model,
    stopWhen: isStepCount(3),
    tools: skillTools("u", { chatId: "c", vision }),
  });
  const prompt = model.doGenerateCalls.at(-1)?.prompt ?? [];
  const [result] = prompt.flatMap((m) => (m.role === "tool" ? m.content : []));
  return {
    output: answer.steps[0]?.toolResults[0]?.output,
    sent: result && "output" in result ? result.output : null,
  };
};

describe("a skill's files in the chat", () => {
  it("hands a picture to a model that sees as the picture itself, and keeps no bytes in the result", async () => {
    const { output, sent } = await told("code.png", true);
    expect(output).toEqual({
      image: { mediaType: "image/png" },
      name: "zz",
      path: "code.png",
    });
    expect(sent).toMatchObject({ type: "content" });
    expect(JSON.stringify(sent)).toContain('"mediaType":"image/png"');
    expect(JSON.stringify(sent)).toContain(Buffer.from(PNG).toString("base64"));
  });

  it("describes a picture for a model that cannot see, once", async () => {
    const { output } = await told("code.png", false);
    expect(output).toMatchObject({ content: "Код склада: K-4217" });
    expect(kept).toEqual(["code.png:Код склада: K-4217"]);
  });

  it("gives a script as text with a word that it cannot be run", async () => {
    const { output } = await told("scripts/check.py", false);
    expect(output).toMatchObject({ content: "print(1)" });
    expect(JSON.stringify(output)).toContain("no sandbox");
  });

  it("says a file that is neither text nor a picture cannot be read", async () => {
    const { output } = await told("notes.zip", true);
    expect(output).toMatchObject({
      error: expect.stringContaining("application/zip"),
    });
  });
});

describe("a skill only the user calls (disable-model-invocation)", () => {
  const skills = [
    { description: "Writes updates.", name: "internal-comms" },
    { description: "Grills a plan.", manual: true, name: "grill-me" },
  ];

  it("is not offered to the model unless the question picked it", () => {
    expect(skillsNote(skills, [])).not.toContain("grill-me");
    expect(skillsNote(skills, [])).toContain("internal-comms");
    expect(skillsNote(skills, ["grill-me"])).toContain("grill-me");
  });

  it("cannot be loaded by the model on its own", async () => {
    const { tools } = skillsOfChat({
      chatId: "c",
      question: "план",
      skills,
      tools: true,
      userId: "u",
      vision: false,
    });
    const load = (tools as Record<string, unknown>).load_skill as {
      execute: (i: unknown, o: unknown) => Promise<unknown>;
    };
    await expect(load.execute({ name: "grill-me" }, {})).resolves.toEqual({
      error: 'There is no skill "grill-me" here.',
    });
  });
});

const saver = () => {
  const { tools } = skillsOfChat({
    chatId: "c",
    question: "сохрани как скилл",
    skills: [],
    tools: true,
    userId: "u1",
    vision: false,
  });
  return (tools as Record<string, unknown>)[SAVE_SKILL] as {
    needsApproval: unknown;
    execute: (i: unknown, o: unknown) => Promise<unknown>;
  };
};

describe("save_skill", () => {
  const input = {
    description: "Weekly sales report.",
    instructions: "1. Ask for the week.",
    name: "weekly-report",
  };
  it("is there for a user with no skills, and asks the user first", () => {
    expect(saver().needsApproval).toBe(true);
  });

  it("is not there for a model that cannot call tools", () => {
    const { tools } = skillsOfChat({
      chatId: "c",
      question: "",
      skills: [],
      tools: false,
      userId: "u1",
      vision: false,
    });
    expect(tools).toEqual({});
  });

  it("keeps the skill as the user's own, never the organization's", async () => {
    created.length = 0;
    createResult = { id: "n", ok: true, replaced: false };
    await expect(saver().execute(input, {})).resolves.toEqual({
      name: "weekly-report",
      replaced: false,
      saved: true,
    });
    expect(created[0]).toEqual([
      { admin: false, userId: "u1" },
      input,
      { replace: undefined },
    ]);
  });

  it("tells the model a taken name is to be replaced only if the user agrees", async () => {
    createResult = { id: "x", ok: false, problem: "taken" };
    const out = (await saver().execute(input, {})) as { error: string };
    expect(out.error).toContain("replace: true");
  });
});
