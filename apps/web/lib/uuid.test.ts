import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { uuid } from "./uuid";

// The server takes a chat's and a message's id only as a UUID (z.uuid()), whatever made it.
const isUuid = (id: string) => z.uuid().safeParse(id).success;

describe("uuid", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("makes a v4 UUID where crypto.randomUUID is missing (a page over http by IP)", () => {
    const real = globalThis.crypto;
    vi.stubGlobal("crypto", {
      getRandomValues: real.getRandomValues.bind(real),
    });
    const ids = Array.from({ length: 200 }, uuid);
    expect(ids.every(isUuid)).toBe(true);
    expect(ids.every((id) => id[14] === "4")).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("takes crypto.randomUUID where there is one", () => {
    const id = uuid();
    expect(isUuid(id)).toBe(true);
  });
});
