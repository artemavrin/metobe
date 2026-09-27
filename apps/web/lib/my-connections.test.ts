import { describe, expect, it } from "vitest";

import { standingDot, standingOf } from "./my-connections";

const at = new Date("2026-09-20T10:00:00Z");
const connection = (status: "active" | "needs_reauth" | "error") => ({
  createdAt: at,
  lastError: null,
  lastUsedAt: null,
  status,
});
const health = (state: "ok" | "auth" | "error") => ({
  checkedAt: at.toISOString(),
  state,
});

describe("where a server stands for a user", () => {
  it("reads a per-user server from their own connection, or none", () => {
    expect(
      standingOf({
        connection: connection("active"),
        health: health("ok"),
        mode: "per_user",
      })
    ).toBe("active");
    expect(
      standingOf({
        connection: { ...connection("needs_reauth"), lastUsedAt: at },
        health: health("ok"),
        mode: "per_user",
      })
    ).toBe("needs_reauth");
    expect(
      standingOf({ connection: null, health: health("ok"), mode: "per_user" })
    ).toBe("none");
  });

  it("does not ask to sign in «again» when the first sign-in was only started", () => {
    expect(
      standingOf({
        connection: connection("needs_reauth"),
        health: health("auth"),
        mode: "per_user",
      })
    ).toBe("none");
    expect(
      standingOf({
        connection: { ...connection("needs_reauth"), lastUsedAt: at },
        health: health("auth"),
        mode: "per_user",
      })
    ).toBe("needs_reauth");
    expect(
      standingOf({
        connection: {
          ...connection("needs_reauth"),
          lastError: "token expired",
        },
        health: health("auth"),
        mode: "per_user",
      })
    ).toBe("needs_reauth");
  });

  it("reads a shared server from the organization's account: only the admin fixes a refused one", () => {
    expect(
      standingOf({ connection: null, health: health("ok"), mode: "shared" })
    ).toBe("org");
    expect(standingOf({ connection: null, health: null, mode: "shared" })).toBe(
      "org"
    );
    expect(
      standingOf({ connection: null, health: health("auth"), mode: "shared" })
    ).toBe("admin");
    expect(
      standingOf({ connection: null, health: health("error"), mode: "shared" })
    ).toBe("error");
  });

  it("marks what needs the user in the sidebar: amber to sign in again, red when refused", () => {
    expect(standingDot("needs_reauth")).toBe("warning");
    expect(standingDot("error")).toBe("error");
    expect(standingDot("none")).toBe("off");
  });
});
