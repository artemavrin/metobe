import type { ChatMessage } from "@metobe/contracts/chat";
import { fileUrl } from "@metobe/contracts/files";
import { describe, expect, it } from "vitest";

import { withCopiedFiles } from "./chat-share";

const OLD = "11111111-1111-4111-8111-111111111111";
const NEW = "22222222-2222-4222-8222-222222222222";
const KEPT = "33333333-3333-4333-8333-333333333333";

const message = (parts: ChatMessage["parts"]): ChatMessage => ({
  id: "m1",
  parts,
  role: "user",
});

describe("withCopiedFiles", () => {
  it("points a copied file at its copy and leaves the words alone", () => {
    const [m] = withCopiedFiles(
      [
        message([
          { mediaType: "image/png", type: "file", url: fileUrl(OLD) },
          { text: "что на картинке?", type: "text" },
        ]),
      ],
      new Map([[OLD, NEW]])
    );
    expect(m?.parts).toEqual([
      { mediaType: "image/png", type: "file", url: fileUrl(NEW) },
      { text: "что на картинке?", type: "text" },
    ]);
  });

  it("keeps the link of a file that was not copied, and of a file that is not ours", () => {
    const outside = "https://example.com/a.png";
    const [m] = withCopiedFiles(
      [
        message([
          { mediaType: "image/png", type: "file", url: fileUrl(KEPT) },
          { mediaType: "image/png", type: "file", url: outside },
        ]),
      ],
      new Map([[OLD, NEW]])
    );
    expect(m?.parts.map((p) => (p.type === "file" ? p.url : null))).toEqual([
      fileUrl(KEPT),
      outside,
    ]);
  });
});
