import { z } from "zod";

// Attachments (D33): what may be attached, how big, and how the composer and the server name a file's kind.

export const FILE_MAX_BYTES = 20 * 1024 * 1024;
/** One message carries at most this many files. */
export const FILES_PER_MESSAGE = 10;

export const fileKinds = ["image", "pdf", "text", "doc", "sheet"] as const;
export type FileKind = (typeof fileKinds)[number];

/** Extension → kind and the media type it is stored and sent with. Documents and sheets the model reads page by page through read_attachment. */
export const ACCEPTED: Record<string, { kind: FileKind; mediaType: string }> = {
  csv: { kind: "text", mediaType: "text/csv" },
  docx: {
    kind: "doc",
    mediaType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  gif: { kind: "image", mediaType: "image/gif" },
  jpeg: { kind: "image", mediaType: "image/jpeg" },
  jpg: { kind: "image", mediaType: "image/jpeg" },
  json: { kind: "text", mediaType: "application/json" },
  md: { kind: "text", mediaType: "text/markdown" },
  pdf: { kind: "pdf", mediaType: "application/pdf" },
  png: { kind: "image", mediaType: "image/png" },
  txt: { kind: "text", mediaType: "text/plain" },
  webp: { kind: "image", mediaType: "image/webp" },
  xlsx: {
    kind: "sheet",
    mediaType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
};

/** The kind of a file by its name; null — not accepted. */
export const acceptedFile = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? (ACCEPTED[name.slice(dot + 1).toLowerCase()] ?? null) : null;
};

/** The `accept` attribute of the file input. */
export const ACCEPT_ATTRIBUTE = Object.keys(ACCEPTED)
  .map((e) => `.${e}`)
  .join(",");

/** What POST /api/files answers: the file as the composer keeps it until the message goes. */
export const uploadedFileSchema = z.object({
  id: z.uuid(),
  kind: z.enum(fileKinds),
  mediaType: z.string(),
  name: z.string(),
  size: z.number().int().nonnegative(),
});
export type UploadedFile = z.infer<typeof uploadedFileSchema>;

/** A file part's URL in a message: the app serves it, the browser never sees S3. */
export const fileUrl = (id: string) => `/api/files/${id}`;
const FILE_URL = /^\/api\/files\/(?<id>[0-9a-f-]{36})$/u;
/** The file id behind a file part's URL; null — not one of ours. */
export const fileIdOf = (url: string) => FILE_URL.exec(url)?.groups?.id ?? null;

export const uploadErrors = [
  "too-big",
  "type",
  "storage-off",
  "failed",
] as const;
export type UploadError = (typeof uploadErrors)[number];
