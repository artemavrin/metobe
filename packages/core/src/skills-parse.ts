import {
  SKILL_DESCRIPTION_MAX,
  SKILL_LIMITS,
  skillNameSchema,
} from "@metobe/contracts/skills";
import type { SkillProblem } from "@metobe/contracts/skills";
import { unzipSync } from "fflate";
import { parse as parseYaml } from "yaml";

// A skill folder read into what we keep (no database here, so it is tested on its own): the folder comes as a zip
// or as files picked from a folder, each with its path. SKILL.md decides where the skill's root is; files outside
// that root, macOS litter and paths that climb out (`..`, absolute) are left out.

export interface FolderFile {
  path: string;
  bytes: Uint8Array;
}

export interface ParsedSkillFile {
  path: string;
  size: number;
  /** Readable by the model: UTF-8 without NUL bytes and not over the text limit. */
  text: boolean;
  content?: string;
  /** Any other file (a picture, an archive) kept whole, with its type by its extension. */
  bytes?: Uint8Array;
  mediaType?: string;
}

const MEDIA: Record<string, string> = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  pdf: "application/pdf",
  png: "image/png",
  webp: "image/webp",
  zip: "application/zip",
};

/** A file's type by its extension; a generic binary for one we do not know. */
export const mediaTypeOf = (path: string) =>
  MEDIA[
    /\.(?<ext>[a-z0-9]+)$/iu.exec(path)?.groups?.ext?.toLowerCase() ?? ""
  ] ?? "application/octet-stream";

/** Files a skill runs rather than reads — Metobe has no sandbox to run them in yet (v3). */
export const isScript = (path: string) =>
  /\.(?:py|sh|bash|js|mjs|cjs|ts|rb|pl|ps1)$/iu.test(path);

export interface ParsedSkill {
  name: string;
  description: string;
  instructions: string;
  frontmatter: Record<string, unknown>;
  files: ParsedSkillFile[];
}

export type ParseResult =
  | { ok: true; skill: ParsedSkill }
  | { ok: false; problem: SkillProblem };

const LITTER = /(?:^|\/)(?:__MACOSX|\.DS_Store|Thumbs\.db)(?:\/|$)/u;

/** How deep a path is: «a/b/SKILL.md» — 3. */
const depth = (path: string) => path.split("/").length;

/** A path as one form: forward slashes, no leading «./» or «/»; null for one that climbs out. */
const cleanPath = (path: string) => {
  const parts = path
    .replaceAll("\\", "/")
    .split("/")
    .filter((p) => p && p !== ".");
  if (parts.some((p) => p === "..") || /^[a-z]:$/iu.test(parts[0] ?? "")) {
    return null;
  }
  return parts.join("/");
};

const decoder = new TextDecoder("utf-8", { fatal: true });

/** The bytes as text, or null when they are not (invalid UTF-8, or a NUL byte — a binary file). */
const asText = (bytes: Uint8Array) => {
  if (bytes.includes(0)) {
    return null;
  }
  try {
    return decoder.decode(bytes);
  } catch {
    return null;
  }
};

/** «---\nyaml\n---\nbody» → the yaml and the body; null without a frontmatter block. */
const splitFrontmatter = (text: string) => {
  const match =
    /^\uFEFF?---\r?\n(?<yaml>[\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)(?<body>[\s\S]*)$/u.exec(
      text
    );
  return match?.groups
    ? { body: match.groups.body ?? "", yaml: match.groups.yaml ?? "" }
    : null;
};

export const parseSkillFolder = (input: FolderFile[]): ParseResult => {
  const files = input.flatMap((f) => {
    const path = cleanPath(f.path);
    return path && !LITTER.test(path) ? [{ ...f, path }] : [];
  });
  // The shallowest SKILL.md is the skill; two at that depth are two skills — one is imported at a time.
  const manifests = files.filter((f) => /(?:^|\/)SKILL\.md$/u.test(f.path));
  const top = Math.min(...manifests.map((m) => depth(m.path)));
  const roots = manifests.filter((m) => depth(m.path) === top);
  if (roots.length === 0) {
    return { ok: false, problem: "no-skill-md" };
  }
  if (roots.length > 1) {
    return { ok: false, problem: "several-skill-md" };
  }
  const manifest = roots[0] as FolderFile;
  const root = manifest.path.slice(0, -"SKILL.md".length);
  const inside = files.filter((f) => f.path.startsWith(root) && f !== manifest);
  if (inside.length + 1 > SKILL_LIMITS.files) {
    return { ok: false, problem: "too-many-files" };
  }
  const total = inside.reduce(
    (sum, f) => sum + f.bytes.length,
    manifest.bytes.length
  );
  if (total > SKILL_LIMITS.total) {
    return { ok: false, problem: "too-big" };
  }

  const text = asText(manifest.bytes);
  const parts = text === null ? null : splitFrontmatter(text);
  if (!parts) {
    return { ok: false, problem: "no-frontmatter" };
  }
  let meta: unknown;
  try {
    meta = parseYaml(parts.yaml);
  } catch {
    return { ok: false, problem: "bad-frontmatter" };
  }
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return { ok: false, problem: "bad-frontmatter" };
  }
  const { name, description, ...rest } = meta as Record<string, unknown>;
  if (typeof name !== "string" || !name.trim()) {
    return { ok: false, problem: "no-name" };
  }
  if (!skillNameSchema.safeParse(name.trim()).success) {
    return { ok: false, problem: "bad-name" };
  }
  if (typeof description !== "string" || !description.trim()) {
    return { ok: false, problem: "no-description" };
  }
  if (description.trim().length > SKILL_DESCRIPTION_MAX) {
    return { ok: false, problem: "long-description" };
  }
  const instructions = parts.body.trim();
  if (!instructions) {
    return { ok: false, problem: "empty-instructions" };
  }

  return {
    ok: true,
    skill: {
      description: description.trim(),
      files: inside
        .map((f): ParsedSkillFile => {
          const path = f.path.slice(root.length);
          const content =
            f.bytes.length <= SKILL_LIMITS.textFile ? asText(f.bytes) : null;
          return content === null
            ? {
                bytes: f.bytes,
                mediaType: mediaTypeOf(path),
                path,
                size: f.bytes.length,
                text: false,
              }
            : { content, path, size: f.bytes.length, text: true };
        })
        // oxlint-disable-next-line unicorn/no-array-sort -- sorts the array it has just made
        .sort((a, b) => a.path.localeCompare(b.path)),
      frontmatter: rest,
      instructions,
      name: name.trim(),
    },
  };
};

/**
 * A zip's files, sizes checked from its directory before anything is inflated: an archive that would unpack past
 * the limit (a zip bomb) is refused, not unpacked.
 */
export const unzipSkill = (
  bytes: Uint8Array
): { ok: true; files: FolderFile[] } | { ok: false; problem: SkillProblem } => {
  let total = 0;
  let count = 0;
  let over = false;
  try {
    const entries = unzipSync(bytes, {
      filter: (file) => {
        if (file.name.endsWith("/")) {
          return false;
        }
        count += 1;
        total += file.originalSize;
        if (total > SKILL_LIMITS.total || count > SKILL_LIMITS.files * 2) {
          over = true;
        }
        return !over;
      },
    });
    if (over) {
      return {
        ok: false,
        problem: count > SKILL_LIMITS.files * 2 ? "too-many-files" : "too-big",
      };
    }
    return {
      files: Object.entries(entries).map(([path, data]) => ({
        bytes: data,
        path,
      })),
      ok: true,
    };
  } catch {
    return { ok: false, problem: "not-zip" };
  }
};
