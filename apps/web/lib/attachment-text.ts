import "server-only";
import type { FileKind } from "@metobe/contracts/files";
import { readFile } from "@metobe/core/files";
import type { FileRow } from "@metobe/core/files";
import mammoth from "mammoth";
import readExcel from "read-excel-file/node";
import { extractText, getDocumentProxy } from "unpdf";

// Text out of an attachment for read_attachment (D33, level 2): a PDF by its own pages, a document, a sheet or a long
// text file in parts of about the same size — the model asks for one part at a time, so a big file does not swell the
// history. Parsers are pure JS (D34): nothing extra to install.

/** The name of the tool that reads an attachment (lib/attachment-tool.ts). */
export const READ_ATTACHMENT = "read_attachment";

/** A file's bytes from storage; null — gone. */
export const bytesOf = async (row: FileRow) => {
  const object = await readFile(row.storageKey).catch(() => null);
  return object
    ? new Uint8Array(await new Response(object.body).arrayBuffer())
    : null;
};

/** A part of a document, in characters: what one read_attachment call returns at most. */
export const PART_SIZE = 12_000;

/** A page of a PDF is cut at this many characters, whatever its size. */
const PAGE_CAP = 30_000;

/** A long text in parts of about `size` characters, cut at a line break when there is one near. */
export const splitParts = (text: string, size = PART_SIZE) => {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > size) {
    const cut = rest.lastIndexOf("\n", size);
    const at = cut > size / 2 ? cut : size;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) {
    parts.push(rest);
  }
  return parts.length > 0 ? parts : [""];
};

const cell = (value: unknown) => {
  if (value === null || value === undefined) {
    return "";
  }
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value);
};

/** A sheet as lines of tab-separated cells under its name. */
const sheetText = (name: string, rows: unknown[][]) =>
  `## ${name}\n${rows.map((r) => r.map(cell).join("\t")).join("\n")}`;

/** The file's text in the parts the model reads; null — the kind has no text to read. */
export const extractParts = async (
  kind: FileKind,
  bytes: Uint8Array
): Promise<string[] | null> => {
  if (kind === "pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: false });
    return text.map((page) => page.trim().slice(0, PAGE_CAP));
  }
  if (kind === "doc") {
    const { value } = await mammoth.extractRawText({
      buffer: Buffer.from(bytes),
    });
    return splitParts(value);
  }
  if (kind === "sheet") {
    const sheets = await readExcel(Buffer.from(bytes));
    return splitParts(
      sheets.map((s) => sheetText(s.sheet, s.data as unknown[][])).join("\n\n")
    );
  }
  if (kind === "text") {
    return splitParts(new TextDecoder("utf-8", { fatal: false }).decode(bytes));
  }
  return null;
};
