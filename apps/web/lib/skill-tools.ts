import "server-only";
import { loadSkill, readSkillFile } from "@metobe/core/skills";
import { tool } from "ai";
import type { Tool } from "ai";
import { z } from "zod";

import { skillsIn } from "./mentions";

// Skills in the chat (ARCH §8.3, Agent Skills): the model sees every skill's name and description, and loads a
// skill's instructions only when a question needs it — the body stays out of the prompt until then. A file beside
// SKILL.md is read the same way, on demand. A skill the user picked with `/name` is loaded before the answer.

export const LOAD_SKILL = "load_skill";
export const READ_SKILL_FILE = "read_skill_file";

/** A skill as the model is told of it before loading. */
export interface OfferedSkill {
  name: string;
  description: string;
}

/**
 * What the model is told: the skills there are, and which ones the user picked for this question. Null when the user
 * has none.
 */
export const skillsNote = (skills: OfferedSkill[], picked: string[]) => {
  if (skills.length === 0) {
    return null;
  }
  const list = skills.map((s) => `- ${s.name}: ${s.description}`).join("\n");
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
  | { name: string; path: string; content: string }
  | { error: string };

/** The two skill tools of a user's chat. */
export const skillTools = (
  userId: string
): {
  [LOAD_SKILL]: Tool<{ name: string }, LoadSkillOutput>;
  [READ_SKILL_FILE]: Tool<{ name: string; path: string }, ReadSkillFileOutput>;
} => ({
  [LOAD_SKILL]: tool({
    description:
      "Load a skill's instructions by its name, before doing the task it is for. Follow them in the answer.",
    execute: async ({ name }) => {
      const skill = await loadSkill(userId, name);
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
      "Read a text file of a loaded skill's folder (a reference, a template) by its path, as the skill's file list gives it.",
    execute: async ({ name, path }) => {
      const content = await readSkillFile(userId, name, path);
      return content === null
        ? { error: `The skill "${name}" has no text file "${path}".` }
        : { content, name, path };
    },
    inputSchema: z.object({
      name: z.string().describe("The skill's name."),
      path: z.string().describe("The file's path in the skill's folder."),
    }),
  }),
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
}: {
  skills: OfferedSkill[];
  question: string;
  tools: boolean;
  userId: string;
}) => {
  if (skills.length === 0 || !tools) {
    return { note: "", tools: {} };
  }
  const picked = skillsIn(
    [question],
    skills.map((s) => s.name)
  );
  return { note: skillsNote(skills, picked) ?? "", tools: skillTools(userId) };
};
