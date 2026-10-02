import "server-only";
import type { ChatMessage } from "@metobe/contracts/chat";
import { fileIdOf, fileUrl } from "@metobe/contracts/files";
import { filesOf } from "@metobe/core/files";
import type { FileRow } from "@metobe/core/files";

import { READ_ATTACHMENT, bytesOf, extractParts } from "./attachment-text";

// Attachments on the way to the model (D33). A message keeps a file part with our URL (`/api/files/<id>`); the model
// gets what it can read: a picture or a PDF as the file itself when it reads them, a short text file as text, anything
// else as a line with the file's id — the model reads it page by page through read_attachment.

type Part = ChatMessage["parts"][number];
type FilePart = Extract<Part, { type: "file" }>;

/** A text file up to this many bytes goes into the message whole; a longer one is read through read_attachment. */
const TEXT_INLINE = 20_000;
/** What a model without tools gets of a file, in characters. */
const TEXT_CAP = 60_000;

/** The file ids a message's file parts point at. */
export const fileIdsOf = (message?: ChatMessage) =>
  (message?.parts ?? []).flatMap((p) => {
    const id = p.type === "file" ? fileIdOf(p.url) : null;
    return id ? [id] : [];
  });

/**
 * The client's message with its file parts checked against the user's own files: a part pointing anywhere else, or at
 * someone else's file, makes the message invalid (null); name and type come from our row, not from the client.
 */
export const ownFiles = async (userId: string, message: ChatMessage) => {
  const ids = fileIdsOf(message);
  if (ids.length !== message.parts.filter((p) => p.type === "file").length) {
    return null;
  }
  const found = await filesOf(userId, ids);
  const rows = new Map(found.map((r) => [r.id, r]));
  if (rows.size !== new Set(ids).size) {
    return null;
  }
  return {
    ...message,
    parts: message.parts.map((p) => {
      const row =
        p.type === "file" ? rows.get(fileIdOf(p.url) ?? "") : undefined;
      return row
        ? ({
            filename: row.name,
            mediaType: row.mediaType,
            type: "file",
            url: fileUrl(row.id),
          } satisfies FilePart)
        : p;
    }),
  };
};

export interface Reader {
  /** `capabilities.vision`: false — certainly not; null — unknown (it gets the picture: most chat models see). */
  vision: boolean | null;
  /** Reads a PDF as a document (Anthropic, OpenAI and their models behind the Gateway). */
  pdf: boolean;
  /** Can call read_attachment; a model that cannot gets the text of its files in the message instead. */
  tools: boolean;
}

/** Whether a model reads PDFs itself: by its source and, behind the Gateway, by the maker in its id. */
export const readsPdf = (kind: string, modelId: string) =>
  kind === "anthropic" ||
  kind === "openai" ||
  (kind === "gateway" && /^(?:anthropic|openai|google)\//u.test(modelId));

const note = (text: string): Part => ({ text, type: "text" });

const KIND_NAME: Record<FileRow["kind"], string> = {
  doc: "document",
  image: "picture",
  pdf: "PDF",
  sheet: "spreadsheet",
  text: "text file",
};

/** A file the model cannot take as it is: its name and id, and the tool that reads it. */
const readable = (row: FileRow, reader: Reader) =>
  note(
    reader.tools
      ? `[Attached ${KIND_NAME[row.kind]} «${row.name}» (id ${row.id}): you cannot see it yourself — read it with ${READ_ATTACHMENT}.]`
      : `[Attached ${KIND_NAME[row.kind]} «${row.name}»: this model cannot read it.]`
  );

/** A file as text in the message: what a model without tools gets, and a short text file for any model. */
const inline = async (row: FileRow, bytes: Uint8Array, cap: number) => {
  const parts = await extractParts(row.kind, bytes).catch(() => null);
  const text = parts?.join("\n\n") ?? "";
  if (!text) {
    return note(`[Attached «${row.name}»: it has no text to read.]`);
  }
  const cut = text.length > cap;
  return note(
    `<file name="${row.name}">\n${cut ? text.slice(0, cap) : text}\n</file>${cut ? `\n[Only the first ${cap} of ${text.length} characters of «${row.name}» are shown.]` : ""}`
  );
};

const asModelPart = async (
  row: FileRow | undefined,
  part: FilePart,
  reader: Reader
): Promise<Part> => {
  if (!row) {
    return note(
      `[Attached file «${part.filename ?? "file"}» is no longer available.]`
    );
  }
  const seen =
    (row.kind === "image" && reader.vision !== false) ||
    (row.kind === "pdf" && reader.pdf);
  if (!seen && row.kind !== "text" && reader.tools) {
    return readable(row, reader);
  }
  const bytes = await bytesOf(row);
  if (!bytes) {
    return note(
      `[Attached file «${row.name}» could not be read from storage.]`
    );
  }
  if (!seen) {
    // A short text file goes in whole; a long one is read through the tool; a model without tools gets what fits.
    if (reader.tools && bytes.length > TEXT_INLINE) {
      return readable(row, reader);
    }
    return row.kind === "image" || row.kind === "pdf"
      ? readable(row, reader)
      : await inline(row, bytes, TEXT_CAP);
  }
  return {
    ...part,
    filename: row.name,
    url: `data:${row.mediaType};base64,${Buffer.from(bytes).toString("base64")}`,
  };
};

/**
 * The history as the model reads it: every file part of every user message turned into what this model can take.
 * A copy — what is stored and shown keeps our URLs.
 */
export const forModel = async (
  userId: string,
  history: ChatMessage[],
  reader: Reader
) => {
  const ids = [...new Set(history.flatMap(fileIdsOf))];
  if (ids.length === 0) {
    return history;
  }
  const found = await filesOf(userId, ids);
  const rows = new Map(found.map((r) => [r.id, r]));
  return await Promise.all(
    history.map(async (m) =>
      m.parts.some((p) => p.type === "file")
        ? {
            ...m,
            parts: await Promise.all(
              m.parts.map((p) =>
                p.type === "file"
                  ? asModelPart(rows.get(fileIdOf(p.url) ?? ""), p, reader)
                  : p
              )
            ),
          }
        : m
    )
  );
};
