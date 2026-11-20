import "server-only";
import { madeFile } from "@metobe/contracts/files";
import type { SandboxClass } from "@metobe/contracts/sandbox";
import { files } from "@metobe/db/schema/files";
import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";

import { bytesOf } from "../attachment-text";
import { getDb } from "../db";
import { filesOf, getFile } from "../files";
import {
  SandboxError,
  acquireBox,
  heartbeatBox,
  listBox,
  putInBox,
  releaseBox,
  runInBox,
  takeFromBox,
} from "../sandbox";
import { loadSkill, readSkillFile } from "../skills";
import { getStorage, putObject } from "../storage";
import type { Sources } from "./tool-sources";
import { summaryOf, tableOf } from "./tool-table";

// The model's code tools (D47). A box per chat: taken at the first call of an answer, all calls of the answer share
// it, and after the answer it waits five minutes for the next one in the same chat. The chat's attachments are in
// /workspace/in; what the person should get goes out through share_file — a file in the chat, never a box path.

export const RUN_CODE = "run_code";
export const SHARE_FILE = "share_file";
export const USE_FILE = "use_file";
export const LOAD_DATA = "load_data";
export const RUN_SKILL_FILES = "run_skill_files";

/** A data file the widgets may take, at most: the table's and the chart's own limits cut it further. */
const DATA_MAX_BYTES = 5 * 1024 * 1024;

const INPUT_DIR = "/workspace/in";
const FILES_DIR = "/workspace/files";
const HEARTBEAT_MS = 60_000;

/** Told to the model with the tools. Kept in step with docker/sandbox/requirements.txt by a test. */
export const SANDBOX_NOTE = `You can run Python 3.13 with ${RUN_CODE}: pandas, numpy, openpyxl, xlsxwriter, python-docx, python-pptx, matplotlib, reportlab, pypdf and the standard library. There is no network and nothing can be installed. Work in /workspace; the chat's attached files are in ${INPUT_DIR} (read-only copies). Use it to analyse data, compute, and make files (tables, documents, slides, charts, PDF).
A file the user should get must be handed over with ${SHARE_FILE}: it then appears in the chat. Never write a /workspace path or a link to one in your answer — the user cannot open it. Hand over only the final files, not intermediate ones.
To show numbers you computed as a table or a chart, write them to a JSON file (a list of objects, one per row) and call ${LOAD_DATA} with its path; then call the table or chart tool with \`from\` set to the ref it answers — never retype computed numbers into the call, and do not draw a matplotlib picture for what the chart tool can show.
The box may be the same as in your last answer in this chat (its files still there) or a new one: the first ${RUN_CODE} says which. A file you handed over earlier comes back with ${USE_FILE}. A skill with scripts runs here: ${RUN_SKILL_FILES} puts its folder in /workspace/skills/<name>, then run its scripts from there instead of reading them. Each ${RUN_CODE} call is a new Python process: variables and imports do not carry over to the next call, files in /workspace do — load what you need again, or save it to a file. Each run has 60 seconds and about 1 GB of memory; print what you need to see, keep the output short.`;

type Output = Record<string, unknown>;

/** The files this chat's answers handed over (share_file outputs): they stay when an edit prunes the chat's files. */
export const madeFileIdsOf = (message: { parts: unknown[] }) =>
  message.parts.flatMap((part) => {
    const p = part as { type?: string; output?: { id?: unknown } };
    return p.type === `tool-${SHARE_FILE}` && typeof p.output?.id === "string"
      ? [p.output.id]
      : [];
  });

const refusal = (error: unknown): Output => {
  if (error instanceof SandboxError) {
    if (error.status === 429) {
      return {
        error:
          "The sandbox is busy right now: tell the user and try later, do not retry at once.",
      };
    }
    if (error.status === 503) {
      return { error: "The sandbox is not available right now." };
    }
    if (error.status === 410) {
      return {
        error:
          "The box was lost; the next call gets a new one, without the files made so far.",
      };
    }
    return { error: error.message };
  }
  console.error("sandbox tool:", error);
  return { error: "The sandbox failed." };
};

/** Reads a JSON table the code wrote and gives it to the widgets by the call's ref; the model gets its summary. */
const loadDataTool = (take: () => Promise<{ id: string }>, sources: Sources) =>
  tool({
    description:
      "Loads a JSON file from the sandbox (a list of objects, one per row) as data for the table and chart tools; answers its ref and a summary.",
    execute: async ({ path }, { toolCallId }): Promise<Output> => {
      let bytes: Uint8Array;
      try {
        const current = await take();
        bytes = await takeFromBox(current.id, path);
      } catch (error) {
        return refusal(error);
      }
      if (bytes.length > DATA_MAX_BYTES) {
        return { error: "The file is larger than 5 MB: aggregate it first." };
      }
      let json: unknown;
      try {
        json = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        return { error: "The file is not JSON." };
      }
      const table = tableOf(json as Parameters<typeof tableOf>[0]);
      if (!table) {
        return {
          error:
            "The file is not a table: write a list of objects with the same keys, one per row.",
        };
      }
      sources.note(toolCallId, json);
      return {
        columns: table.columns.map((c) => c.name),
        ref: toolCallId,
        rows: table.rows.length,
        ...(summaryOf(table, toolCallId) ? {} : { data: table.rows }),
      };
    },
    inputSchema: z.object({
      path: z
        .string()
        .min(1)
        .describe("The JSON file's path, e.g. /workspace/by_month.json."),
    }),
  });

/** Why a run stopped short, for the model. */
const noteOf = (result: { timedOut: boolean; outOfMemory: boolean }) => {
  if (result.timedOut) {
    return { note: "Stopped at the 60-second limit." };
  }
  if (result.outOfMemory) {
    return { note: "Ran out of memory (about 1 GB)." };
  }
  return {};
};

/** Unique names in /workspace/in: «a.csv», «a (2).csv». */
const uniqueNames = (names: string[]) => {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const safe = name.replaceAll("/", "_").replace(/^\.+/u, "_") || "file";
    const n = (seen.get(safe) ?? 0) + 1;
    seen.set(safe, n);
    if (n === 1) {
      return safe;
    }
    const dot = safe.lastIndexOf(".");
    return dot > 0
      ? `${safe.slice(0, dot)} (${n})${safe.slice(dot)}`
      : `${safe} (${n})`;
  });
};

/**
 * The code tools of one answer. `release` must be called when the answer ends, however it ends: `keep` — the box
 * waits for the next answer in this chat (an ordinary chat answer), otherwise it goes (a task's run).
 */
export const sandboxSession = (options: {
  userId: string;
  chatId: string;
  /** The chat's attachments, by id: they go to /workspace/in. */
  fileIds: string[];
  class: SandboxClass;
  /** A task's run has no chat for files to join; its files go nowhere but the run's answer. */
  shareTo?: { chatId: string | null; taskId?: string };
  /** The widgets' data (tool-sources): load_data puts a computed table there for show_table and show_chart. */
  sources?: Sources;
}) => {
  let box: { id: string; fresh: boolean; told: boolean } | null = null;
  let taking: Promise<{ id: string; fresh: boolean; told: boolean }> | null =
    null;
  let beat: NodeJS.Timeout | undefined;

  const putInputs = async (boxId: string, fresh: boolean) => {
    const rows = await filesOf(options.userId, options.fileIds);
    if (rows.length === 0) {
      return [];
    }
    const names = uniqueNames(rows.map((r) => r.name));
    const listed = fresh ? [] : await listBox(boxId);
    const there = new Set(listed.map((f) => f.path));
    const placed = rows.map((row, i) => ({
      path: `${INPUT_DIR}/${names[i]}`,
      row,
    }));
    await Promise.all(
      placed
        .filter((p) => !there.has(p.path))
        .map(async ({ path, row }) => {
          const bytes = await bytesOf(row);
          if (bytes) {
            await putInBox(boxId, path, bytes);
          }
        })
    );
    return placed.map((p) => p.path);
  };

  const open = async () => {
    try {
      const got = await acquireBox({
        class: options.class,
        key: options.chatId,
        userId: options.userId,
      });
      const opened = { fresh: got.fresh, id: got.boxId, told: false };
      box = opened;
      // The service drops a busy box nobody touches: while the model thinks between calls, this keeps it.
      beat = setInterval(async () => {
        try {
          await heartbeatBox(opened.id);
        } catch {
          // The next call finds out.
        }
      }, HEARTBEAT_MS);
      await putInputs(got.boxId, got.fresh);
      return opened;
    } finally {
      taking = null;
    }
  };

  /** The answer's box: taken at the first call, shared by the calls that follow (and by two made at once). */
  const take = () => {
    if (box) {
      return Promise.resolve(box);
    }
    taking ??= open();
    return taking;
  };

  /** The box died (out of memory for all of it): the next call takes a new one. */
  const lose = () => {
    box = null;
    clearInterval(beat);
  };

  const tools: ToolSet = {
    [RUN_CODE]: tool({
      description:
        "Runs Python 3 code in the sandbox (/workspace, no network) and returns its output. Files stay between calls of this answer.",
      execute: async ({ code }): Promise<Output> => {
        let current;
        try {
          current = await take();
        } catch (error) {
          return refusal(error);
        }
        // The first call of the answer says what box it is: new, or the chat's last one with its files.
        let intro: Output = {};
        if (!current.told) {
          current.told = true;
          const listed = await listBox(current.id).catch(() => []);
          intro = {
            box: current.fresh
              ? "A new box: only the attached files are here."
              : "The same box as your last answer in this chat: its files are still here.",
            files: listed.slice(0, 50).map((f) => f.path),
          };
        }
        try {
          const result = await runInBox(current.id, code);
          if (result.boxLost) {
            lose();
            return {
              ...intro,
              error:
                "The box ran out of memory and was lost with its files. Use less memory (read in chunks, fewer columns); the next call gets a new box.",
            };
          }
          return {
            ...intro,
            exitCode: result.exitCode,
            ...(result.stdout ? { stdout: result.stdout } : {}),
            ...(result.stderr ? { stderr: result.stderr } : {}),
            ...noteOf(result),
            ...(result.truncated
              ? {
                  truncated:
                    "The output was long: its middle is cut, the start and the end are kept.",
                }
              : {}),
          };
        } catch (error) {
          return { ...intro, ...refusal(error) };
        }
      },
      inputSchema: z.object({
        code: z
          .string()
          .min(1)
          .describe("Python source; print what you need to see."),
      }),
    }),

    [SHARE_FILE]: tool({
      description:
        "Hands a file from the sandbox over to the user: it appears in the chat to open and download. Use it for every file the user should get.",
      execute: async ({ path, name }): Promise<Output> => {
        if (!getStorage()) {
          return {
            error:
              "File storage is not set up, so files cannot be handed over.",
          };
        }
        let current;
        try {
          current = await take();
        } catch (error) {
          return refusal(error);
        }
        let bytes: Uint8Array;
        try {
          bytes = await takeFromBox(current.id, path);
        } catch (error) {
          if (error instanceof SandboxError && error.status === 410) {
            lose();
          }
          return refusal(error);
        }
        const fileName = (name ?? path.split("/").at(-1) ?? "file").slice(
          0,
          255
        );
        const { kind, mediaType } = madeFile(fileName);
        const id = crypto.randomUUID();
        const storageKey = `files/${id}`;
        await putObject(storageKey, bytes, {
          contentLength: bytes.length,
          contentType: mediaType,
        });
        await getDb()
          .db.insert(files)
          .values({
            chatId: options.shareTo ? options.shareTo.chatId : options.chatId,
            id,
            kind,
            mediaType,
            name: fileName,
            origin: "generated",
            size: bytes.length,
            storageKey,
            taskId: options.shareTo?.taskId,
            userId: options.userId,
          });
        return { id, kind, mediaType, name: fileName, size: bytes.length };
      },
      inputSchema: z.object({
        name: z
          .string()
          .min(1)
          .max(200)
          .optional()
          .describe(
            "The name the user sees, with its extension; the file's own name when left out."
          ),
        path: z
          .string()
          .min(1)
          .describe(
            "The file's path in the sandbox, e.g. /workspace/report.xlsx."
          ),
      }),
    }),

    ...(options.sources
      ? { [LOAD_DATA]: loadDataTool(take, options.sources) }
      : {}),

    [RUN_SKILL_FILES]: tool({
      description:
        "Puts a skill's whole folder (SKILL.md, scripts, templates, assets) into the sandbox at /workspace/skills/<name>, to run its scripts there.",
      execute: async ({ name }): Promise<Output> => {
        const skill = await loadSkill(options.userId, name);
        if (!skill) {
          return { error: `No skill named «${name}».` };
        }
        let current;
        try {
          current = await take();
        } catch (error) {
          return refusal(error);
        }
        const folder = `/workspace/skills/${skill.name}`;
        try {
          await putInBox(
            current.id,
            `${folder}/SKILL.md`,
            new TextEncoder().encode(skill.instructions)
          );
          const read = await Promise.all(
            skill.files.map(async (f) => ({
              file: await readSkillFile(options.userId, skill.name, f.path),
              path: f.path,
            }))
          );
          await Promise.all(
            read.flatMap(({ file, path }) => {
              if (!file) {
                return [];
              }
              const bytes =
                file.kind === "text"
                  ? new TextEncoder().encode(file.content)
                  : file.bytes;
              return [putInBox(current.id, `${folder}/${path}`, bytes)];
            })
          );
        } catch (error) {
          return refusal(error);
        }
        return {
          files: skill.files.map((f) => f.path),
          folder,
        };
      },
      inputSchema: z.object({
        name: z.string().min(1).describe("The skill's name."),
      }),
    }),

    [USE_FILE]: tool({
      description:
        "Puts a file handed over earlier in this chat back into the sandbox, by its id; answers its path there.",
      execute: async ({ id }): Promise<Output> => {
        const row = await getFile(options.userId, id);
        if (!row || row.chatId !== options.chatId) {
          return { error: "No such file in this chat." };
        }
        let current;
        try {
          current = await take();
        } catch (error) {
          return refusal(error);
        }
        const bytes = await bytesOf(row);
        if (!bytes) {
          return { error: "The file could not be read from storage." };
        }
        const [name] = uniqueNames([row.name]);
        const path = `${FILES_DIR}/${name}`;
        try {
          await putInBox(current.id, path, bytes);
        } catch (error) {
          return refusal(error);
        }
        return { path };
      },
      inputSchema: z.object({
        id: z.uuid().describe("The file's id, from share_file's answer."),
      }),
    }),
  };

  return {
    note: SANDBOX_NOTE,
    /** The answer ended. Never throws. */
    release: async (keep: boolean) => {
      clearInterval(beat);
      const pending = taking;
      const current = box ?? (pending ? await pending.catch(() => null) : null);
      box = null;
      if (current) {
        await releaseBox(current.id, keep);
      }
    },
    tools,
  };
};
