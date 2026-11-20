import { z } from "zod";

// Attachments (D33): what may be attached, how big, and how the composer and the server name a file's kind.

export const FILE_MAX_BYTES = 20 * 1024 * 1024;
/** One message carries at most this many files. */
export const FILES_PER_MESSAGE = 10;

/** `other` — a file the sandbox made that is none of these (slides, an archive…): it is only downloaded (D47). */
export const fileKinds = [
  "image",
  "pdf",
  "text",
  "doc",
  "sheet",
  "other",
] as const;
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

/** Where a file came from: picked by the person, or made by the model's code in the sandbox (D47). */
export const fileOrigins = ["upload", "generated"] as const;
export type FileOrigin = (typeof fileOrigins)[number];

/** What the sandbox may hand over besides what is accepted from the person: everything else goes as `other`. */
const MADE: Record<string, { kind: FileKind; mediaType: string }> = {
  html: { kind: "text", mediaType: "text/html" },
  pptx: {
    kind: "other",
    mediaType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  },
  svg: { kind: "other", mediaType: "image/svg+xml" },
  zip: { kind: "other", mediaType: "application/zip" },
};

/** The kind of a file the sandbox made, by its name: anything goes, unknown types as bytes to download. */
export const madeFile = (name: string) => {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  return (
    ACCEPTED[ext] ??
    MADE[ext] ?? {
      kind: "other" as const,
      mediaType: "application/octet-stream",
    }
  );
};

/** The kind of a file by its name; null — not accepted. */
export const acceptedFile = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? (ACCEPTED[name.slice(dot + 1).toLowerCase()] ?? null) : null;
};

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
