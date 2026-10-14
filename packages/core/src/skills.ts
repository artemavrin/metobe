import "server-only";
import type { SkillProblem, SkillSummary } from "@metobe/contracts/skills";
import { skillFiles, skills } from "@metobe/db/schema/skills";
import type { Skill } from "@metobe/db/schema/skills";
import { and, asc, eq, isNull, or } from "drizzle-orm";

import { getDb } from "./db";
import { isScript, parseSkillFolder, unzipSkill } from "./skills-parse";
import type { FolderFile } from "./skills-parse";
import { deletePrefix, getObject, getStorage, putObject } from "./storage";

// Skills (ARCH §8.3): the organization's (no owner, an admin's to change) and each user's own. A chat gets every
// enabled skill the user may use — their own first: a personal skill with a shared one's name stands in for it.

export type { Skill } from "@metobe/db/schema/skills";

/** Who acts: their id, and whether they may change the organization's skills. */
export interface SkillActor {
  userId: string;
  admin: boolean;
}

/** Where a skill's files other than text lie in S3. */
const prefixOf = (id: string) => `skills/${id}/`;

const summaryOf = (s: Skill): SkillSummary => ({
  description: s.description,
  enabled: s.enabled,
  files: s.files.length,
  id: s.id,
  manual: s.frontmatter["disable-model-invocation"] === true,
  name: s.name,
  ownerId: s.ownerId,
  scripts: s.files.filter((f) => isScript(f.path)).length,
  updatedAt: s.updatedAt.toISOString(),
});

/** May this actor change this skill: the organization's — an admin; a personal one — its owner. */
export const canEditSkill = (
  skill: Pick<Skill, "ownerId">,
  actor: SkillActor
) => (skill.ownerId === null ? actor.admin : skill.ownerId === actor.userId);

export type ImportResult =
  | { ok: true; id: string; replaced: boolean }
  | { ok: false; problem: SkillProblem; id?: string };

/**
 * Takes a folder (files with paths) or a zip and keeps the skill under `shared` (the organization's) or the actor's
 * own. A skill of that name already there is refused unless `replace` — then it takes the new contents and keeps
 * its id and whether it is on.
 */
export const importSkill = async (
  actor: SkillActor,
  input: { zip: Uint8Array } | { files: FolderFile[] },
  { shared, replace = false }: { shared: boolean; replace?: boolean }
): Promise<ImportResult> => {
  if (shared && !actor.admin) {
    throw new Error("forbidden");
  }
  let files: FolderFile[];
  if ("zip" in input) {
    const unzipped = unzipSkill(input.zip);
    if (!unzipped.ok) {
      return unzipped;
    }
    ({ files } = unzipped);
  } else {
    ({ files } = input);
  }
  const parsed = parseSkillFolder(files);
  if (!parsed.ok) {
    return parsed;
  }
  const { skill } = parsed;
  const ownerId = shared ? null : actor.userId;
  const { db } = getDb();
  return await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: skills.id })
      .from(skills)
      .where(
        and(
          eq(skills.name, skill.name),
          ownerId === null
            ? isNull(skills.ownerId)
            : eq(skills.ownerId, ownerId)
        )
      );
    if (existing && !replace) {
      return { id: existing.id, ok: false, problem: "taken" } as const;
    }
    const values = {
      description: skill.description,
      files: skill.files.map(({ path, size, text }) => ({ path, size, text })),
      frontmatter: skill.frontmatter,
      instructions: skill.instructions,
      name: skill.name,
      ownerId,
    };
    let id: string;
    if (existing) {
      ({ id } = existing);
      await tx.update(skills).set(values).where(eq(skills.id, id));
      await tx.delete(skillFiles).where(eq(skillFiles.skillId, id));
    } else {
      const [row] = await tx
        .insert(skills)
        .values(values)
        .returning({ id: skills.id });
      if (!row) {
        throw new Error("the skill was not saved");
      }
      ({ id } = row);
    }
    // Every file is kept: a text one as text; any other in S3 when there is one, else in the database.
    const store = getStorage() !== null;
    if (existing && store) {
      await deletePrefix(prefixOf(id));
    }
    const rows = await Promise.all(
      skill.files.map(async (f) => {
        if (f.text && f.content !== undefined) {
          return {
            content: f.content,
            path: f.path,
            size: f.size,
            skillId: id,
          };
        }
        const base = {
          mediaType: f.mediaType,
          path: f.path,
          size: f.size,
          skillId: id,
        };
        if (!f.bytes) {
          return base;
        }
        if (!store) {
          return { ...base, data: f.bytes };
        }
        const storageKey = `${prefixOf(id)}${f.path}`;
        await putObject(storageKey, f.bytes, {
          contentLength: f.bytes.length,
          contentType: f.mediaType,
        });
        return { ...base, storageKey };
      })
    );
    if (rows.length > 0) {
      await tx.insert(skillFiles).values(rows);
    }
    return { id, ok: true, replaced: Boolean(existing) } as const;
  });
};

/** The skills the settings show this actor: the organization's and their own, by name. */
export const listSkills = async (actor: SkillActor) => {
  const rows = await getDb()
    .db.select()
    .from(skills)
    .where(or(isNull(skills.ownerId), eq(skills.ownerId, actor.userId)))
    .orderBy(asc(skills.name));
  return rows.map(summaryOf);
};

/** One skill with what it holds, when the actor may see it (the organization's, or their own). */
export const getSkill = async (actor: SkillActor, id: string) => {
  const { db } = getDb();
  const [skill] = await db.select().from(skills).where(eq(skills.id, id));
  if (!skill || (skill.ownerId !== null && skill.ownerId !== actor.userId)) {
    return null;
  }
  return { ...skill, editable: canEditSkill(skill, actor) };
};

/** Turns a skill on or off; false when the actor may not. */
export const setSkillEnabled = async (
  actor: SkillActor,
  id: string,
  enabled: boolean
) => {
  const skill = await getSkill(actor, id);
  if (!skill?.editable) {
    return false;
  }
  await getDb().db.update(skills).set({ enabled }).where(eq(skills.id, id));
  return true;
};

/** Deletes a skill and its files; false when the actor may not. */
export const deleteSkill = async (actor: SkillActor, id: string) => {
  const skill = await getSkill(actor, id);
  if (!skill?.editable) {
    return false;
  }
  await getDb().db.delete(skills).where(eq(skills.id, id));
  if (getStorage()) {
    await deletePrefix(prefixOf(id)).catch((error: unknown) =>
      console.error("skills: could not delete the files", id, error)
    );
  }
  return true;
};

/**
 * The skills a user's chat offers, by name: enabled ones, the organization's and their own — their own wins a
 * shared name. What the model sees of each before it loads one: name and description.
 */
export const skillsForChat = async (userId: string) => {
  const rows = await getDb()
    .db.select({
      description: skills.description,
      frontmatter: skills.frontmatter,
      id: skills.id,
      name: skills.name,
      ownerId: skills.ownerId,
    })
    .from(skills)
    .where(
      and(
        eq(skills.enabled, true),
        or(isNull(skills.ownerId), eq(skills.ownerId, userId))
      )
    )
    .orderBy(asc(skills.name));
  const byName = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    if (!byName.has(r.name) || r.ownerId !== null) {
      byName.set(r.name, r);
    }
  }
  // `disable-model-invocation: true` (Agent Skills): only the user calls it, with `/name`; the model is not offered it.
  return [...byName.values()].map(({ frontmatter, ...skill }) => ({
    ...skill,
    manual: frontmatter["disable-model-invocation"] === true,
  }));
};

/** A skill's instructions and the list of its files, by name, for the chat of this user; null if there is none. */
export const loadSkill = async (userId: string, name: string) => {
  const offered = await skillsForChat(userId);
  const usable = offered.find((s) => s.name === name);
  if (!usable) {
    return null;
  }
  const [skill] = await getDb()
    .db.select()
    .from(skills)
    .where(eq(skills.id, usable.id));
  return skill ?? null;
};

/** A file of a skill as the chat reads it: text, or bytes with their type (and a picture's kept description). */
export type SkillFile =
  | { kind: "text"; content: string }
  | {
      kind: "binary";
      skillId: string;
      mediaType: string;
      bytes: Uint8Array;
      description: string | null;
    };

const bytesOf = async (stream: ReadableStream<Uint8Array>) =>
  new Uint8Array(await new Response(stream).arrayBuffer());

/** One file of a skill the user's chat may use; null when there is no such skill or file, or its bytes are gone. */
export const readSkillFile = async (
  userId: string,
  name: string,
  path: string
): Promise<SkillFile | null> => {
  const skill = await loadSkill(userId, name);
  if (!skill) {
    return null;
  }
  const [row] = await getDb()
    .db.select()
    .from(skillFiles)
    .where(and(eq(skillFiles.skillId, skill.id), eq(skillFiles.path, path)));
  if (!row) {
    return null;
  }
  if (row.content !== null) {
    return { content: row.content, kind: "text" };
  }
  let bytes = row.data;
  if (!bytes && row.storageKey) {
    const object = await getObject(row.storageKey);
    bytes = object ? await bytesOf(object.body) : null;
  }
  return bytes
    ? {
        bytes,
        description: row.description,
        kind: "binary",
        mediaType: row.mediaType ?? "application/octet-stream",
        skillId: skill.id,
      }
    : null;
};

/** Keeps what a skill's picture shows, so it is described once. */
export const keepSkillFileDescription = async (
  skillId: string,
  path: string,
  description: string
) => {
  await getDb()
    .db.update(skillFiles)
    .set({ description })
    .where(and(eq(skillFiles.skillId, skillId), eq(skillFiles.path, path)));
};
