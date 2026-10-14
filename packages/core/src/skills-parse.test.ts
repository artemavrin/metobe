import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { parseSkillFolder, unzipSkill } from "./skills-parse";

const md = (front: string, body = "Do the thing step by step.") =>
  strToU8(`---\n${front}\n---\n\n${body}\n`);
const file = (path: string, text: string | Uint8Array) => ({
  bytes: typeof text === "string" ? strToU8(text) : text,
  path,
});
const good = md(
  "name: pdf-forms\ndescription: Fills PDF forms. Use when a PDF form must be filled.\nlicense: MIT"
);

describe("parseSkillFolder", () => {
  it("reads a skill folder: name, description, the rest of the frontmatter, instructions and text files", () => {
    const result = parseSkillFolder([
      { bytes: good, path: "pdf-forms/SKILL.md" },
      file("pdf-forms/reference/fields.md", "# Fields"),
      file("pdf-forms/scripts/fill.py", "print('hi')"),
    ]);
    expect(result).toEqual({
      ok: true,
      skill: {
        description: "Fills PDF forms. Use when a PDF form must be filled.",
        files: [
          {
            content: "# Fields",
            path: "reference/fields.md",
            size: 8,
            text: true,
          },
          {
            content: "print('hi')",
            path: "scripts/fill.py",
            size: 11,
            text: true,
          },
        ],
        frontmatter: { license: "MIT" },
        instructions: "Do the thing step by step.",
        name: "pdf-forms",
      },
    });
  });

  it("takes the folder's root from SKILL.md and leaves out litter, files beside it and paths that climb out", () => {
    const result = parseSkillFolder([
      { bytes: good, path: "export/pdf-forms/SKILL.md" },
      file("export/pdf-forms/a.md", "a"),
      file("export/other.md", "not the skill's"),
      file("__MACOSX/export/pdf-forms/._a.md", "litter"),
      file("export/pdf-forms/.DS_Store", "litter"),
      file("export/pdf-forms/../../etc/passwd", "climbs out"),
    ]);
    expect(result.ok && result.skill.files.map((f) => f.path)).toEqual([
      "a.md",
    ]);
  });

  it("lists a binary file without its content", () => {
    const result = parseSkillFolder([
      { bytes: good, path: "SKILL.md" },
      file("logo.png", new Uint8Array([137, 80, 78, 71, 0, 1, 2])),
    ]);
    expect(result.ok && result.skill.files).toEqual([
      { path: "logo.png", size: 7, text: false },
    ]);
  });

  it.each([
    [[file("README.md", "x")], "no-skill-md"],
    [[file("a/SKILL.md", "x"), file("b/SKILL.md", "x")], "several-skill-md"],
    [[file("SKILL.md", "no frontmatter here")], "no-frontmatter"],
    [[{ bytes: md("name: [unclosed"), path: "SKILL.md" }], "bad-frontmatter"],
    [[{ bytes: md("description: no name"), path: "SKILL.md" }], "no-name"],
    [
      [{ bytes: md("name: PDF Forms\ndescription: x"), path: "SKILL.md" }],
      "bad-name",
    ],
    [
      [{ bytes: md("name: claude-helper\ndescription: x"), path: "SKILL.md" }],
      "bad-name",
    ],
    [[{ bytes: md("name: ok"), path: "SKILL.md" }], "no-description"],
    [
      [
        {
          bytes: md(`name: ok\ndescription: ${"x".repeat(1025)}`),
          path: "SKILL.md",
        },
      ],
      "long-description",
    ],
    [
      [{ bytes: md("name: ok\ndescription: x", ""), path: "SKILL.md" }],
      "empty-instructions",
    ],
  ] as const)(
    "refuses a folder that is not a skill (%#: %s)",
    (files, problem) => {
      expect(parseSkillFolder([...files])).toEqual({ ok: false, problem });
    }
  );
});

describe("unzipSkill", () => {
  it("unpacks a zip into files with their paths", () => {
    const zip = zipSync({ "s/SKILL.md": good, "s/ref.md": strToU8("r") });
    const result = unzipSkill(zip);
    expect(result.ok && result.files.map((f) => f.path).toSorted()).toEqual([
      "s/SKILL.md",
      "s/ref.md",
    ]);
  });

  it("refuses an archive that would unpack past the limit before inflating it", () => {
    const zip = zipSync({ "big.txt": new Uint8Array(11 * 1024 * 1024) });
    expect(unzipSkill(zip)).toEqual({ ok: false, problem: "too-big" });
  });

  it("says when the bytes are not a zip", () => {
    expect(unzipSkill(strToU8("plain text"))).toEqual({
      ok: false,
      problem: "not-zip",
    });
  });
});
