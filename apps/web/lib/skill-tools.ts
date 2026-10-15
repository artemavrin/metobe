import "server-only";
import {
  SKILL_DESCRIPTION_MAX,
  skillNameSchema,
} from "@metobe/contracts/skills";
import {
  createSkill,
  keepSkillFileDescription,
  loadSkill,
  readSkillFile,
} from "@metobe/core/skills";
import { isScript } from "@metobe/core/skills-parse";
import { describeImage } from "@metobe/core/vision";
import { dynamicTool, tool } from "ai";
import type { Tool, ToolSet } from "ai";
import { z } from "zod";

import { skillsIn } from "./mentions";

// Skills in the chat (ARCH §8.3, Agent Skills): the model sees every skill's name and description, and loads a
// skill's instructions only when a question needs it — the body stays out of the prompt until then. A file beside
// SKILL.md is read the same way, on demand. A skill the user picked with `/name` is loaded before the answer.

export const LOAD_SKILL = "load_skill";
export const READ_SKILL_FILE = "read_skill_file";
export const SAVE_SKILL = "save_skill";

/** A skill as the model is told of it before loading. */
export interface OfferedSkill {
  name: string;
  description: string;
  /** Only the user calls it, with `/name` (`disable-model-invocation`): the model is not offered it by itself. */
  manual?: boolean;
}

/**
 * What the model is told: the skills there are, and which ones the user picked for this question. Null when the user
 * has none.
 */
export const skillsNote = (skills: OfferedSkill[], picked: string[]) => {
  // A skill only the user calls is listed when the question picked it.
  const offered = skills.filter((s) => !s.manual || picked.includes(s.name));
  if (offered.length === 0) {
    return null;
  }
  const list = offered.map((s) => `- ${s.name}: ${s.description}`).join("\n");
  const asked =
    picked.length > 0
      ? `\n\nThe user picked ${picked.map((p) => `/${p}`).join(", ")} for this question: call ${LOAD_SKILL} for ${picked.length > 1 ? "each of them" : "it"} first and follow its instructions.`
      : "";
  return `Skills — instructions for particular tasks. When a question matches a skill's description, call ${LOAD_SKILL} with its name and follow what it says; read a file it mentions with ${READ_SKILL_FILE}.\n${list}${asked}`;
};

export type LoadSkillOutput =
  | {
      name: string;
      instructions: string;
      /** The folder's other files: the text ones can be read with read_skill_file. */
      files: { path: string; text: boolean }[];
    }
  | { error: string };

export type ReadSkillFileOutput =
  | {
      name: string;
      path: string;
      /** The file's text; for a picture to a model that cannot see, what the picture shows. */
      content?: string;
      /** A picture handed to a model that sees: the picture itself goes with the result. */
      image?: { mediaType: string };
      note?: string;
    }
  | { error: string };

/** What the model is told of a script: it reads it, it cannot run it. */
const SCRIPT_NOTE =
  "This is a script. Metobe has no sandbox to run it: read it to follow its logic, never claim it ran.";

const read = async (
  userId: string,
  { name, path }: { name: string; path: string },
  { chatId, vision }: { chatId: string; vision: boolean }
): Promise<ReadSkillFileOutput> => {
  const file = await readSkillFile(userId, name, path);
  if (!file) {
    return { error: `The skill "${name}" has no file "${path}".` };
  }
  if (file.kind === "text") {
    return {
      content: file.content,
      name,
      path,
      ...(isScript(path) ? { note: SCRIPT_NOTE } : {}),
    };
  }
  if (!file.mediaType.startsWith("image/")) {
    return {
      error: `"${path}" is a ${file.mediaType} file, not text or a picture: it cannot be read here.`,
    };
  }
  if (vision) {
    return { image: { mediaType: file.mediaType }, name, path };
  }
  if (file.description) {
    return {
      content: file.description,
      name,
      note: "What the picture shows, described for you.",
      path,
    };
  }
  const described = await describeImage({
    bytes: file.bytes,
    chatId,
    mediaType: file.mediaType,
    userId,
  });
  if ("error" in described) {
    return {
      error:
        described.error === "off"
          ? "No model is set up to describe pictures: an administrator can choose one under Settings → Service models → Vision."
          : "The picture could not be described right now.",
    };
  }
  await keepSkillFileDescription(file.skillId, path, described.text);
  return {
    content: described.text,
    name,
    note: "What the picture shows, described for you.",
    path,
  };
};

/** The two skill tools of a user's chat; a model that sees gets a skill's pictures as pictures. */
export const skillTools = (
  userId: string,
  how: {
    chatId: string;
    vision: boolean;
    /** Skills only the user calls that this question did not pick: the model may not load them. */
    closed?: Set<string>;
  }
): {
  [LOAD_SKILL]: Tool<{ name: string }, LoadSkillOutput>;
  [READ_SKILL_FILE]: Tool<{ name: string; path: string }, ReadSkillFileOutput>;
} => ({
  [LOAD_SKILL]: tool({
    description:
      "Load a skill's instructions by its name, before doing the task it is for. Follow them in the answer.",
    execute: async ({ name }) => {
      const skill = how.closed?.has(name)
        ? null
        : await loadSkill(userId, name);
      if (!skill) {
        return { error: `There is no skill "${name}" here.` };
      }
      return {
        files: skill.files.map((f) => ({ path: f.path, text: f.text })),
        instructions: skill.instructions,
        name: skill.name,
      };
    },
    inputSchema: z.object({
      name: z.string().describe("The skill's name, as listed."),
    }),
  }),
  [READ_SKILL_FILE]: tool({
    description:
      "Read a file of a loaded skill's folder by its path, as the skill's file list gives it: a text file (a reference, a template, a script — read, never run) or a picture.",
    execute: (input) =>
      how.closed?.has(input.name)
        ? Promise.resolve({ error: `There is no skill "${input.name}" here.` })
        : read(userId, input, how),
    inputSchema: z.object({
      name: z.string().describe("The skill's name."),
      path: z.string().describe("The file's path in the skill's folder."),
    }),
    // A picture goes to the model as itself, read again from where it is kept: the stored result holds no bytes.
    toModelOutput: async ({ input, output }) => {
      if (!("image" in output) || !output.image) {
        return { type: "json", value: output };
      }
      const file = await readSkillFile(userId, input.name, input.path);
      if (!file || file.kind !== "binary") {
        return {
          type: "text",
          value: `The picture "${input.path}" is no longer there.`,
        };
      }
      return {
        type: "content",
        value: [
          {
            text: `The picture ${input.path} of the skill ${input.name}:`,
            type: "text",
          },
          {
            data: {
              data: Buffer.from(file.bytes).toString("base64"),
              type: "data",
            },
            mediaType: file.mediaType,
            type: "file",
          },
        ],
      };
    },
  }),
});

const saveSkillInput = z.object({
  description: z
    .string()
    .min(1)
    .max(SKILL_DESCRIPTION_MAX)
    .describe(
      "What the skill does and when to use it, in a sentence or two: the model reads it to decide whether the skill fits a question."
    ),
  instructions: z
    .string()
    .min(1)
    .describe(
      "The instructions, in Markdown, as a person would write them for someone doing the task: the steps, the rules, the shape of the answer. Written for any later use, not for this chat's details."
    ),
  name: skillNameSchema.describe(
    "The skill's name: lowercase letters, digits and hyphens (for example weekly-sales-report)."
  ),
  replace: z
    .boolean()
    .optional()
    .describe(
      "Overwrite the user's skill of this name. Only after the tool said the name is taken and the user wants it replaced."
    ),
});

/** Why a skill written in the chat was not kept, for the model to tell the user. */
const SAVE_PROBLEM: Partial<Record<string, string>> = {
  "bad-name": "The name must be lowercase letters, digits and hyphens.",
  "empty-instructions": "The instructions are empty.",
  "long-description": `The description is over ${SKILL_DESCRIPTION_MAX} characters.`,
  taken:
    "The user already has a skill with this name. Ask whether to replace it (then call again with replace: true) or choose another name.",
  "too-big": "The skill is too big.",
};

/**
 * The user's own «save this as a skill»: the model writes the skill from the conversation — a task the user did well
 * and wants again — and the user is asked first, with the skill in front of them. It is kept as theirs alone.
 * A dynamic tool, so its «ask first» is the answer's approval card, as a letter's is.
 */
export const saveSkillTool = (userId: string): Tool =>
  dynamicTool({
    description:
      "Save a skill for the user — a task they have just done with you, written as instructions they can call again with /name. Use it only when the user asks to save the work, the way of doing it or the answer's shape as a skill. Write the instructions from what worked in this conversation, general enough to use again. The user sees the skill and says yes or no before it is kept.",
    execute: async (input) => {
      const { replace, ...skill } = saveSkillInput.parse(input);
      const result = await createSkill({ admin: false, userId }, skill, {
        replace,
      });
      if (!result.ok) {
        return {
          error:
            SAVE_PROBLEM[result.problem] ??
            `The skill could not be saved (${result.problem}).`,
        };
      }
      return { name: skill.name, replaced: result.replaced, saved: true };
    },
    inputSchema: saveSkillInput,
    needsApproval: true,
  });

/**
 * What the skills give a chat request: the two tools and the note for the model, when the user has skills and the
 * model can call tools; nothing otherwise. The question's `/name`s are the skills it picked.
 */
export const skillsOfChat = ({
  skills,
  question,
  tools,
  userId,
  chatId,
  vision,
}: {
  skills: OfferedSkill[];
  question: string;
  tools: boolean;
  userId: string;
  chatId: string;
  /** The chat model sees pictures: a skill's pictures go to it as they are. */
  vision: boolean;
}): { note: string; tools: ToolSet } => {
  if (!tools) {
    return { note: "", tools: {} };
  }
  // A user with no skills can still write their first one from a chat.
  if (skills.length === 0) {
    return { note: "", tools: { [SAVE_SKILL]: saveSkillTool(userId) } };
  }
  const picked = skillsIn(
    [question],
    skills.map((s) => s.name)
  );
  const closed = new Set(
    skills
      .filter((s) => s.manual && !picked.includes(s.name))
      .map((s) => s.name)
  );
  return {
    note: skillsNote(skills, picked) ?? "",
    tools: {
      ...skillTools(userId, { chatId, closed, vision }),
      [SAVE_SKILL]: saveSkillTool(userId),
    },
  };
};
