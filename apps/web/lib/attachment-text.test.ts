import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@metobe/core/files", () => ({ readFile: vi.fn() }));

const { PART_SIZE, extractParts, splitParts } =
  await import("./attachment-text");

const fixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`fixtures/${name}`, import.meta.url)));

describe("splitParts", () => {
  it("keeps a short text whole and an empty one as one empty part", () => {
    expect(splitParts("коротко")).toEqual(["коротко"]);
    expect(splitParts("  ")).toEqual([""]);
  });

  it("cuts a long text at line breaks, losing nothing", () => {
    const lines = Array.from({ length: 2000 }, (_, i) => `строка ${i}`);
    const parts = splitParts(lines.join("\n"));
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= PART_SIZE)).toBe(true);
    expect(parts.join("\n").split("\n")).toEqual(lines);
  });

  it("cuts a text with no line breaks at the size", () => {
    expect(
      splitParts("x".repeat(PART_SIZE * 2 + 5)).map((p) => p.length)
    ).toEqual([PART_SIZE, PART_SIZE, 5]);
  });
});

describe("extractParts", () => {
  it("gives a PDF page by page", async () => {
    const pages = await extractParts("pdf", fixture("two-pages.pdf"));
    expect(pages).toHaveLength(2);
    expect(pages?.[0]).toContain("Invoice 0412 total 1500");
    expect(pages?.[1]).toContain("paid in full");
  });

  it("reads the text of a docx", async () => {
    const parts = await extractParts("doc", fixture("contract.docx"));
    expect(parts?.[0]).toContain("Договор аренды");
    expect(parts?.[0]).toContain("Срок: 11 месяцев");
  });

  it("reads a sheet as tab-separated rows under the sheet's name", async () => {
    const parts = await extractParts("sheet", fixture("sales.xlsx"));
    expect(parts?.[0]).toBe("## Продажи Q3\nТовар\tСумма\nСтол\t1500");
  });

  it("reads a text file and refuses a picture", async () => {
    const bytes = new TextEncoder().encode("# Итоги");
    expect(await extractParts("text", bytes)).toEqual(["# Итоги"]);
    expect(await extractParts("image", bytes)).toBeNull();
  });
});
