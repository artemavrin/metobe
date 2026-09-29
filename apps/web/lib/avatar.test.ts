import { describe, expect, it } from "vitest";

import { isAvatar, MAX_AVATAR_BYTES } from "./avatar";

describe("what may be an avatar", () => {
  it("takes a small png, jpeg or webp as a data URL", () => {
    expect(isAvatar("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
    expect(isAvatar("data:image/webp;base64,UklGRg==")).toBe(true);
    expect(isAvatar("data:image/jpeg;base64,/9j/4AAQ")).toBe(true);
  });

  it("refuses what a browser could run or fetch", () => {
    expect(isAvatar("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(isAvatar("https://example.com/me.png")).toBe(false);
    expect(isAvatar("data:text/html;base64,PGh0bWw+")).toBe(false);
    expect(isAvatar("data:image/png;base64,AAAA<script>")).toBe(false);
  });

  it("refuses a big picture", () => {
    const big = `data:image/png;base64,${"A".repeat(Math.ceil((MAX_AVATAR_BYTES * 4) / 3) + 8)}`;
    expect(isAvatar(big)).toBe(false);
  });
});
