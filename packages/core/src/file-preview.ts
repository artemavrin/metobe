import "server-only";
import {
  PREVIEW_MAX_COLUMNS,
  PREVIEW_MAX_ROWS,
  PREVIEW_MAX_TEXT,
} from "@metobe/contracts/files";
import type { FilePreview } from "@metobe/contracts/files";
import mammoth from "mammoth";
import readExcel from "read-excel-file/node";

import type { FileRow } from "./files";

// A file as the viewer draws it (D47): a sheet as its tables, a document as HTML (shown in a sandboxed frame, never
// in the page), a text as text. The same pure-JS parsers as read_attachment (D34). A PDF and a picture open as they are.

const cellText = (value: unknown) => {
  if (value === null || value === undefined) {
    return "";
  }
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value);
};

const cutRows = (rows: unknown[][]) => {
  const cut =
    rows.length > PREVIEW_MAX_ROWS ||
    rows.some((r) => r.length > PREVIEW_MAX_COLUMNS);
  return {
    cut,
    rows: rows
      .slice(0, PREVIEW_MAX_ROWS)
      .map((r) => r.slice(0, PREVIEW_MAX_COLUMNS).map(cellText)),
  };
};

/** A CSV line by line: quoted cells with commas and doubled quotes; a semicolon when the first line has more of them. */
export const parseCsv = (text: string) => {
  const first = text.split("\n", 1)[0] ?? "";
  const sep =
    (first.match(/;/gu)?.length ?? 0) > (first.match(/,/gu)?.length ?? 0)
      ? ";"
      : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') {
        quoted = false;
      } else {
        cell += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell.replace(/\r$/u, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += c;
    }
  }
  if (cell || row.length > 0) {
    row.push(cell.replace(/\r$/u, ""));
    rows.push(row);
  }
  return rows;
};

const decode = (bytes: Uint8Array) =>
  new TextDecoder("utf-8", { fatal: false }).decode(bytes);

/** The viewer's version of a file; `none` for what it does not draw (slides, archives…), which is downloaded. */
export const filePreview = async (
  row: Pick<FileRow, "kind" | "mediaType" | "name">,
  bytes: Uint8Array
): Promise<FilePreview> => {
  if (row.kind === "sheet") {
    const sheets = await readExcel(Buffer.from(bytes));
    const drawn = sheets.map((s) => ({
      name: s.sheet,
      ...cutRows(s.data as unknown[][]),
    }));
    return {
      cut: drawn.some((s) => s.cut),
      sheets: drawn.map(({ name, rows }) => ({ name, rows })),
      type: "sheet",
    };
  }
  if (row.kind === "doc") {
    const { value } = await mammoth.convertToHtml({
      buffer: Buffer.from(bytes),
    });
    return { html: value, type: "html" };
  }
  if (row.mediaType === "text/csv") {
    const { cut, rows } = cutRows(parseCsv(decode(bytes)));
    return { cut, sheets: [{ name: row.name, rows }], type: "sheet" };
  }
  if (row.kind === "text" && row.mediaType !== "text/html") {
    const text = decode(bytes);
    return {
      cut: text.length > PREVIEW_MAX_TEXT,
      markdown: row.mediaType === "text/markdown",
      text: text.slice(0, PREVIEW_MAX_TEXT),
      type: "text",
    };
  }
  return { type: "none" };
};
