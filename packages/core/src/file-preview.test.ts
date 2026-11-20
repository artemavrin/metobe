import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { filePreview, parseCsv } = await import("./file-preview");

describe("file preview", () => {
  it("reads a CSV with quotes, commas inside them and a semicolon separator", () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\r\n1,2')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["1", "2"],
    ]);
    expect(parseCsv("a;b\n1,5;2")).toEqual([
      ["a", "b"],
      ["1,5", "2"],
    ]);
  });

  it("draws a CSV as a sheet and a markdown file as text", async () => {
    const csv = await filePreview(
      { kind: "text", mediaType: "text/csv", name: "s.csv" },
      new TextEncoder().encode("m,v\njan,1\n")
    );
    expect(csv).toEqual({
      cut: false,
      sheets: [
        {
          name: "s.csv",
          rows: [
            ["m", "v"],
            ["jan", "1"],
          ],
        },
      ],
      type: "sheet",
    });
    const md = await filePreview(
      { kind: "text", mediaType: "text/markdown", name: "a.md" },
      new TextEncoder().encode("# Итог")
    );
    expect(md).toEqual({
      cut: false,
      markdown: true,
      text: "# Итог",
      type: "text",
    });
  });

  it("does not draw an HTML file or slides", async () => {
    const bytes = new TextEncoder().encode("<script>alert(1)</script>");
    expect(
      await filePreview(
        { kind: "text", mediaType: "text/html", name: "a.html" },
        bytes
      )
    ).toEqual({ type: "none" });
    expect(
      await filePreview(
        { kind: "other", mediaType: "application/zip", name: "a.pptx" },
        bytes
      )
    ).toEqual({ type: "none" });
  });
});
