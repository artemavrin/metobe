import type { ChatMessage } from "@metobe/contracts/chat";
import { fileUrl } from "@metobe/contracts/files";
import type { FileRow } from "@metobe/core/files";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const store = vi.hoisted(() => ({
  bytes: new Map<string, Uint8Array<ArrayBuffer>>(),
  rows: [] as FileRow[],
}));

vi.mock("@metobe/core/files", () => ({
  filesOf: (userId: string, ids: string[]) =>
    Promise.resolve(
      store.rows.filter((r) => r.userId === userId && ids.includes(r.id))
    ),
  readFile: (key: string) => {
    const bytes = store.bytes.get(key);
    return bytes
      ? Promise.resolve({ body: new Blob([bytes]).stream() })
      : Promise.reject(new Error("no such key"));
  },
}));

const { forModel, ownFiles, readsPdf } = await import("./attachments");

const ME = "user-me";

const row = (over: Partial<FileRow> & Pick<FileRow, "kind" | "name">) => {
  const id = crypto.randomUUID();
  const r: FileRow = {
    chatId: null,
    createdAt: new Date(),
    description: null,
    id,
    mediaType: "application/octet-stream",
    size: 1,
    storageKey: `files/${id}`,
    userId: ME,
    ...over,
  };
  store.rows.push(r);
  return r;
};

const message = (parts: ChatMessage["parts"]): ChatMessage =>
  ({ id: crypto.randomUUID(), parts, role: "user" }) as ChatMessage;

const filePart = (r: FileRow, filename = "из клиента.bin") => ({
  filename,
  mediaType: "text/html",
  type: "file" as const,
  url: fileUrl(r.id),
});

const SEES = { pdf: true, tools: true, vision: true };

beforeEach(() => {
  store.rows.length = 0;
  store.bytes.clear();
});

describe("ownFiles", () => {
  it("takes name and type from our row, not from the client", async () => {
    const r = row({ kind: "image", mediaType: "image/png", name: "скрин.png" });
    const checked = await ownFiles(
      ME,
      message([{ text: "вот", type: "text" }, filePart(r)])
    );
    expect(checked?.parts[1]).toEqual({
      filename: "скрин.png",
      mediaType: "image/png",
      type: "file",
      url: fileUrl(r.id),
    });
  });

  it("refuses someone else's file, an unknown one, and a URL not ours", async () => {
    const theirs = row({ kind: "image", name: "чужой.png", userId: "other" });
    const gone = { ...theirs, id: crypto.randomUUID() };
    const checked = await Promise.all(
      [
        [filePart(theirs)],
        [filePart(gone)],
        [{ ...filePart(theirs), url: "https://example.com/a.png" }],
      ].map((parts) => ownFiles(ME, message(parts)))
    );
    expect(checked).toEqual([null, null, null]);
  });
});

describe("forModel", () => {
  it("leaves a history without files as it is", async () => {
    const history = [message([{ text: "привет", type: "text" }])];
    expect(await forModel(ME, history, SEES)).toBe(history);
  });

  it("sends a picture to a model that sees, as the file itself", async () => {
    const r = row({ kind: "image", mediaType: "image/png", name: "скрин.png" });
    store.bytes.set(r.storageKey, new Uint8Array([1, 2, 3]));
    const [m] = await forModel(ME, [message([filePart(r)])], SEES);
    expect(m.parts[0]).toMatchObject({
      filename: "скрин.png",
      type: "file",
      url: "data:image/png;base64,AQID",
    });
  });

  it("points a model that cannot see a picture or a PDF at read_attachment, with the file's id", async () => {
    const image = row({
      kind: "image",
      mediaType: "image/png",
      name: "скрин.png",
    });
    const pdf = row({
      kind: "pdf",
      mediaType: "application/pdf",
      name: "счёт.pdf",
    });
    const [m] = await forModel(
      ME,
      [message([filePart(image), filePart(pdf)])],
      { pdf: false, tools: true, vision: false }
    );
    const [a, b] = m.parts.map((p) => (p.type === "text" ? p.text : ""));
    expect(a).toContain(`id ${image.id}`);
    expect(a).toContain("read_attachment");
    expect(b).toContain(`id ${pdf.id}`);
    expect(b).toContain("read_attachment");
  });

  it("points every model at read_attachment for a document or a sheet", async () => {
    const doc = row({ kind: "doc", name: "договор.docx" });
    const sheet = row({ kind: "sheet", name: "продажи.xlsx" });
    const [m] = await forModel(
      ME,
      [message([filePart(doc), filePart(sheet)])],
      SEES
    );
    expect(m.parts.map((p) => p.type)).toEqual(["text", "text"]);
    expect(JSON.stringify(m.parts)).toContain(`id ${doc.id}`);
    expect(JSON.stringify(m.parts)).toContain(`id ${sheet.id}`);
  });

  it("gives a picture to a model whose sight is unknown", async () => {
    const r = row({ kind: "image", mediaType: "image/png", name: "скрин.png" });
    store.bytes.set(r.storageKey, new Uint8Array([1]));
    const [m] = await forModel(ME, [message([filePart(r)])], {
      pdf: false,
      tools: true,
      vision: null,
    });
    expect(m.parts[0].type).toBe("file");
  });

  it("inlines a short text file and leaves a long one to the tool", async () => {
    const small = row({
      kind: "text",
      mediaType: "text/markdown",
      name: "заметки.md",
    });
    store.bytes.set(small.storageKey, new TextEncoder().encode("# Итоги"));
    const big = row({ kind: "text", mediaType: "text/plain", name: "лог.txt" });
    store.bytes.set(
      big.storageKey,
      new TextEncoder().encode("x".repeat(70_000))
    );
    const [m] = await forModel(
      ME,
      [message([filePart(small), filePart(big)])],
      SEES
    );
    const [a, b] = m.parts.map((p) => (p.type === "text" ? p.text : ""));
    expect(a).toBe('<file name="заметки.md">\n# Итоги\n</file>');
    expect(b).toContain(`id ${big.id}`);
    expect(b).not.toContain("xxxx");
  });

  it("gives a model without tools the text itself, cut at the cap", async () => {
    const big = row({ kind: "text", mediaType: "text/plain", name: "лог.txt" });
    store.bytes.set(
      big.storageKey,
      new TextEncoder().encode("x".repeat(70_000))
    );
    const [m] = await forModel(ME, [message([filePart(big)])], {
      ...SEES,
      tools: false,
    });
    const text = m.parts[0].type === "text" ? m.parts[0].text : "";
    expect(text).toMatch(/Only the first 60000 of \d+/u);
    expect(text.length).toBeLessThan(61_000);
  });

  it("says so when a file is gone or storage fails", async () => {
    const lost = row({
      kind: "image",
      mediaType: "image/png",
      name: "скрин.png",
    });
    const deleted = filePart(
      { ...lost, id: crypto.randomUUID() },
      "старый.png"
    );
    const [m] = await forModel(ME, [message([filePart(lost), deleted])], SEES);
    const texts = m.parts.map((p) => (p.type === "text" ? p.text : ""));
    expect(texts[0]).toContain("could not be read");
    expect(texts[1]).toContain("«старый.png» is no longer available");
  });
});

describe("readsPdf", () => {
  it("knows Anthropic, OpenAI and their models behind the Gateway", () => {
    expect(readsPdf("anthropic", "claude-sonnet-5-5")).toBe(true);
    expect(readsPdf("gateway", "google/gemini-3-pro")).toBe(true);
    expect(readsPdf("gateway", "xai/grok-5")).toBe(false);
    expect(readsPdf("openai-compatible", "qwen3")).toBe(false);
  });
});
