import { describe, expect, it } from "vitest";

import { acceptedFile, fileIdOf, fileUrl } from "./files";

describe("acceptedFile", () => {
  it("knows a file by its extension, whatever its case", () => {
    expect(acceptedFile("скрин ошибки.PNG")).toEqual({
      kind: "image",
      mediaType: "image/png",
    });
    expect(acceptedFile("Счёт-фактура 0412.pdf")?.kind).toBe("pdf");
    expect(acceptedFile("заметки.md")?.kind).toBe("text");
    expect(acceptedFile("договор аренды.docx")?.kind).toBe("doc");
    expect(acceptedFile("Выгрузка продаж Q3.xlsx")?.kind).toBe("sheet");
  });

  it("refuses what it does not read, and a name with no extension", () => {
    expect(acceptedFile("видео.mov")).toBeNull();
    expect(acceptedFile("презентация.pptx")).toBeNull();
    expect(acceptedFile("старый договор.doc")).toBeNull();
    expect(acceptedFile("pdf")).toBeNull();
    expect(acceptedFile(".png")).toBeNull();
  });
});

describe("fileIdOf", () => {
  it("reads the id back from our URL", () => {
    const id = crypto.randomUUID();
    expect(fileIdOf(fileUrl(id))).toBe(id);
  });

  it("refuses any other URL", () => {
    const id = crypto.randomUUID();
    for (const url of [
      `https://example.com/api/files/${id}`,
      `/api/files/${id}/x`,
      `data:image/png;base64,AAAA`,
      "/api/files/not-an-id",
    ]) {
      expect(fileIdOf(url)).toBeNull();
    }
  });
});
