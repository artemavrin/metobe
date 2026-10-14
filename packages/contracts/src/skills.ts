import { z } from "zod";

// Skills in the Agent Skills format: a folder with SKILL.md — `name` and `description` in its frontmatter, the
// instructions after it — and any files beside it. The rules a folder must meet to be imported.

/** Lowercase letters, digits and hyphens, up to 64; not a word the vendors keep for themselves. */
export const skillNameSchema = z
  .string()
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u, "skill-name")
  .refine((name) => !/anthropic|claude/u.test(name), "skill-name-reserved");

export const SKILL_DESCRIPTION_MAX = 1024;

/** How big a folder may be: the whole of it, one text file the model may read, how many files. */
export const SKILL_LIMITS = {
  files: 200,
  textFile: 256 * 1024,
  total: 10 * 1024 * 1024,
} as const;

/** Why a folder was not taken — the settings screen says it in words. */
export const skillProblems = [
  "no-skill-md",
  "several-skill-md",
  "no-frontmatter",
  "bad-frontmatter",
  "no-name",
  "bad-name",
  "no-description",
  "long-description",
  "empty-instructions",
  "too-big",
  "too-many-files",
  "not-zip",
  "taken",
] as const;
export type SkillProblem = (typeof skillProblems)[number];

/** A skill as the list shows it. */
export interface SkillSummary {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  /** Null — the organization's. */
  ownerId: string | null;
  files: number;
  /** Only the user calls it, with `/name` (`disable-model-invocation`). */
  manual: boolean;
  /** Scripts in the folder: read by the model, never run (Metobe has no sandbox yet). */
  scripts: number;
  updatedAt: string;
}
