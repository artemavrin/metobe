import { readFileSync } from "node:fs";

import type { FileRow } from "@metobe/core/files";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const store = vi.hoisted(() => ({
  bytes: new Map<string, Uint8Array<ArrayBuffer>>(),
  rows: [] as FileRow[],
}));

vi.mock("@metobe/core/files", () => ({
  getFile: (userId: string, id: string) =>
    Promise.resolve(
      store.rows.find((r) => r.userId === userId && r.id === id) ?? null
    ),
  readFile: (key: string) => {
    const bytes = store.bytes.get(key);
    return bytes
      ? Promise.resolve({ body: new Blob([bytes]).stream() })
      : Promise.reject(new Error("no such key"));
  },
}));

const vision = vi.hoisted(() => ({ describeImage: vi.fn() }));
vi.mock("@metobe/core/vision", () => vision);

const { readAttachmentTool } = await import("./attachment-tool");

const ME = "user-me";
const run = async (input: { id: string; page?: number }, userId = ME) => {
  const tool = readAttachmentTool(userId, "chat-1");
  // The tool's own execute, as the SDK calls it.
  return await tool.execute?.(input, {
    context: undefined,
    messages: [],
    toolCallId: "t",
  });
};

const put = (
  kind: FileRow["kind"],
  name: string,
  bytes: Uint8Array<ArrayBuffer>
) => {
  const id = crypto.randomUUID();
  store.rows.push({
    chatId: null,
    createdAt: new Date(),
    description: null as string | null,
    id,
    kind,
    mediaType: "application/octet-stream",
    name,
    size: bytes.length,
    storageKey: `files/${id}`,
    userId: ME,
  });
  store.bytes.set(`files/${id}`, bytes);
  return id;
};

const fixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`fixtures/${name}`, import.meta.url)));

beforeEach(() => {
  vision.describeImage.mockReset();
  store.rows.length = 0;
  store.bytes.clear();
});

describe("read_attachment", () => {
  it("reads a PDF page by page and says there is more", async () => {
    const id = put("pdf", "счёт.pdf", fixture("two-pages.pdf"));
    const first = await run({ id });
    expect(first).toMatchObject({ name: "счёт.pdf", page: 1, pages: 2 });
    expect(JSON.stringify(first)).toContain("Invoice 0412");
    expect(JSON.stringify(first)).toContain("Page 2 of 2 follows");
    const second = await run({ id, page: 2 });
    expect(JSON.stringify(second)).toContain("paid in full");
    expect((second as { note?: string }).note).toBeUndefined();
  });

  it("refuses a page past the end", async () => {
    const id = put("pdf", "счёт.pdf", fixture("two-pages.pdf"));
    expect(await run({ id, page: 3 })).toEqual({
      error: "The file has only 2 pages.",
    });
  });

  it("reads a document and a sheet", async () => {
    const doc = put("doc", "договор.docx", fixture("contract.docx"));
    const sheet = put("sheet", "продажи.xlsx", fixture("sales.xlsx"));
    expect(JSON.stringify(await run({ id: doc }))).toContain(
      "Срок: 11 месяцев"
    );
    expect(await run({ id: sheet })).toMatchObject({
      text: expect.stringContaining("Стол\t1500"),
    });
  });

  it("will not read someone else's file, a missing one, or a picture", async () => {
    const id = put("text", "заметки.md", new TextEncoder().encode("секрет"));
    expect(await run({ id }, "stranger")).toEqual({ error: "No such file." });
    expect(await run({ id: crypto.randomUUID() })).toEqual({
      error: "No such file.",
    });
  });

  it("has a picture described by the vision model, once", async () => {
    vision.describeImage.mockResolvedValue({ text: "Скриншот ошибки 500" });
    const id = put("image", "скрин.png", new Uint8Array([1]));
    expect(await run({ id })).toEqual({
      name: "скрин.png",
      page: 1,
      pages: 1,
      text: "Скриншот ошибки 500",
    });
    expect(vision.describeImage).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: "chat-1", fileId: id, userId: ME })
    );
    // The words are kept on the file's row: the next read does not ask the model.
    const row = store.rows.find((r) => r.id === id);
    if (row) {
      row.description = "Скриншот ошибки 500";
    }
    vision.describeImage.mockClear();
    expect(await run({ id })).toMatchObject({ text: "Скриншот ошибки 500" });
    expect(vision.describeImage).not.toHaveBeenCalled();
  });

  it("says where to set up sight when no model has the job, and when it fails", async () => {
    const id = put("image", "скрин.png", new Uint8Array([1]));
    vision.describeImage.mockResolvedValueOnce({ error: "off" });
    expect(await run({ id })).toMatchObject({
      error: expect.stringContaining("Service models"),
    });
    vision.describeImage.mockResolvedValueOnce({ error: "failed" });
    expect(await run({ id })).toEqual({
      error: "The picture could not be described right now.",
    });
  });

  it("says so for a file that is not readable", async () => {
    const id = put("pdf", "битый.pdf", new TextEncoder().encode("not a pdf"));
    expect(await run({ id })).toEqual({
      error: "The file is damaged or not readable.",
    });
  });
});
