import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

// Skills (ARCH §8.3): folders in the Agent Skills format — SKILL.md with `name` and `description` in its frontmatter,
// and files beside it. Shared ones are the admin's (no owner), personal ones a user's. The model sees every enabled
// skill's name and description and reads the rest with tools, so the body and the text files live here, in the
// database: skills work without S3. Files that are not text are listed, never read.

export const skills = pgTable(
  "skills",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** What the skill does and when to use it — the model picks a skill by this. Up to 1024 characters. */
    description: text("description").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    /** Every file of the folder but SKILL.md: path, size, whether it is text (and so readable by the model). */
    files: jsonb("files")
      .$type<{ path: string; size: number; text: boolean }[]>()
      .notNull()
      .default([]),
    /** The rest of the frontmatter (license, compatibility, metadata…), as it came. */
    frontmatter: jsonb("frontmatter")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    id: uuid("id").primaryKey().defaultRandom(),
    /** SKILL.md without its frontmatter: what `load_skill` gives the model. */
    instructions: text("instructions").notNull(),
    /** The skill's `name`: lowercase letters, digits and hyphens, up to 64 — what «/» and the model call it by. */
    name: text("name").notNull(),
    /** Null — the organization's (an admin's); otherwise one user's own. */
    ownerId: text("owner_id").references(() => user.id, {
      onDelete: "cascade",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // One name per owner, and one among the organization's: «/name» must point at one skill.
    uniqueIndex("skills_shared_name")
      .on(table.name)
      .where(sql`${table.ownerId} is null`),
    uniqueIndex("skills_owner_name")
      .on(table.ownerId, table.name)
      .where(sql`${table.ownerId} is not null`),
    index("skills_owner").on(table.ownerId),
  ]
);

/** Raw bytes, for a skill's file kept in the database when there is no S3. */
const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => "bytea",
});

/**
 * A file of a skill's folder, kept whole. A text one (a reference, a template, a script) — its `content`, what
 * `read_skill_file` gives; any other (a picture, an archive) — its bytes, in S3 under `storage_key` when the
 * installation has one, else here in `data`. A picture's description, made once by the «vision» model, is kept too.
 */
export const skillFiles = pgTable(
  "skill_files",
  {
    content: text("content"),
    data: bytea("data"),
    /** What a picture shows, from the «vision» model, for a chat model that cannot see. */
    description: text("description"),
    mediaType: text("media_type"),
    path: text("path").notNull(),
    size: integer("size").notNull(),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    storageKey: text("storage_key"),
  },
  (table) => [primaryKey({ columns: [table.skillId, table.path] })]
);

export type Skill = typeof skills.$inferSelect;
