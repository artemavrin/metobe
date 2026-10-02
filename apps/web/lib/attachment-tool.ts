import "server-only";
import { getFile } from "@metobe/core/files";
import { describeImage } from "@metobe/core/vision";
import { tool } from "ai";
import type { Tool } from "ai";
import { z } from "zod";

import { READ_ATTACHMENT, bytesOf, extractParts } from "./attachment-text";

export { READ_ATTACHMENT } from "./attachment-text";

/** Told to the model, with the tool, when the chat has files. */
export const ATTACHMENT_NOTE = `Files the user attached that you cannot see yourself stand in the messages as «[Attached file … id …]». Read such a file with ${READ_ATTACHMENT} (its id, then page 1, 2, … as the answer says there are more) and answer from what it returns; read only the pages the question needs. Never ask the user to paste a file's text.`;

const readInput = z.object({
  id: z.uuid().describe("The file's id, as the message gives it."),
  page: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      "A PDF's page, or the part of any other file; 1 when left out. The answer says how many there are."
    ),
});
export type ReadInput = z.infer<typeof readInput>;

export type ReadOutput =
  | {
      name: string;
      page: number;
      pages: number;
      text: string;
      /** Said when the page is empty or there is more to read. */
      note?: string;
    }
  | { error: string };

// The text of the last few files read, so the next page of a file is not parsed again. Per process, small.
const KEPT = 16;
const kept = new Map<string, string[]>();

const partsOf = async (id: string, load: () => Promise<string[] | null>) => {
  const hit = kept.get(id);
  if (hit) {
    kept.delete(id);
    kept.set(id, hit);
    return hit;
  }
  const parts = await load();
  if (parts) {
    kept.set(id, parts);
    if (kept.size > KEPT) {
      kept.delete(kept.keys().next().value as string);
    }
  }
  return parts;
};

/** Reads one page of one of the user's attachments as text: a PDF by its pages, anything else by parts. */
export const readAttachmentTool = (
  userId: string,
  chatId: string
): Tool<ReadInput, ReadOutput> =>
  tool({
    description:
      "Reads an attached file as text, one page (a PDF) or part (a document, a sheet, a long text) at a time; for a picture, a description of it with the text in it. The answer carries the number of pages; ask for the next one only if the question needs it.",
    execute: async ({ id, page = 1 }): Promise<ReadOutput> => {
      const row = await getFile(userId, id);
      if (!row) {
        return { error: "No such file." };
      }
      if (row.kind === "image" && row.description) {
        return { name: row.name, page: 1, pages: 1, text: row.description };
      }
      const bytes = await bytesOf(row);
      if (!bytes) {
        return { error: "The file could not be read from storage." };
      }
      if (row.kind === "image") {
        const described = await describeImage({
          bytes,
          chatId,
          fileId: row.id,
          mediaType: row.mediaType,
          userId,
        });
        if ("text" in described) {
          return { name: row.name, page: 1, pages: 1, text: described.text };
        }
        return {
          error:
            described.error === "off"
              ? "No model is set up to describe pictures: an administrator can choose one under Settings → Service models → Vision."
              : "The picture could not be described right now.",
        };
      }
      let parts: string[] | null;
      try {
        parts = await partsOf(id, () => extractParts(row.kind, bytes));
      } catch (error) {
        console.error("read_attachment: could not read", id, error);
        return { error: "The file is damaged or not readable." };
      }
      if (!parts) {
        return { error: "This kind of file has no text to read." };
      }
      if (page > parts.length) {
        return { error: `The file has only ${parts.length} pages.` };
      }
      const text = parts[page - 1] ?? "";
      let note: string | undefined;
      if (!text) {
        note =
          row.kind === "pdf"
            ? "This page has no text — it may be a scan or a picture."
            : "The file has no text.";
      } else if (page < parts.length) {
        note = `Page ${page + 1} of ${parts.length} follows.`;
      }
      return { name: row.name, note, page, pages: parts.length, text };
    },
    inputSchema: readInput,
  });
