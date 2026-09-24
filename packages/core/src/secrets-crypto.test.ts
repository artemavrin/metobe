import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { aadFor, hintFor, open, parseKey, seal } from "./secrets-crypto";

const newKey = () => parseKey(randomBytes(32).toString("base64"));

describe("secrets crypto (ARCH §17.2)", () => {
  const key = newKey();
  const aad = aadFor("source", "src_1", "api_key");

  it("round-trips a value with a fresh IV each time", () => {
    const a = seal("sk-proj-secret", aad, key);
    const b = seal("sk-proj-secret", aad, key);
    expect(open(a, aad, [key])).toBe("sk-proj-secret");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("refuses a ciphertext moved to another owner or purpose", () => {
    const sealed = seal("sk-proj-secret", aad, key);
    expect(() =>
      open(sealed, aadFor("source", "src_2", "api_key"), [key])
    ).toThrow();
    expect(() =>
      open(sealed, aadFor("source", "src_1", "password"), [key])
    ).toThrow();
  });

  it("refuses tampering", () => {
    const sealed = seal("sk-proj-secret", aad, key);
    const flipped = Buffer.from(sealed.ciphertext, "base64");
    flipped[0] = flipped[0] === 0 ? 1 : 0;
    expect(() =>
      open({ ...sealed, ciphertext: flipped.toString("base64") }, aad, [key])
    ).toThrow();
  });

  it("names the missing key instead of failing obscurely", () => {
    const sealed = seal("x", aad, key);
    expect(() => open(sealed, aad, [newKey()])).toThrow(/unknown key/u);
  });

  it("decrypts with the previous key during rotation", () => {
    const previous = newKey();
    const current = newKey();
    const old = seal("AQVN-yandex", aad, previous);
    expect(open(old, aad, [current, previous])).toBe("AQVN-yandex");
    expect(seal("AQVN-yandex", aad, current).keyId).toBe(current.id);
  });

  it("accepts only 32-byte keys", () => {
    expect(() => parseKey(randomBytes(16).toString("base64"))).toThrow(
      /32 random bytes/u
    );
    expect(parseKey(randomBytes(32).toString("base64")).id).toHaveLength(12);
  });

  it("hints without revealing the value", () => {
    expect(hintFor("sk-proj-7Hc2Lq9VbN4xKt1Wm8Rz")).toBe("sk-…m8Rz");
    expect(hintFor("AQVN1r8Zk3Pq9Tx4Lm2Wb7Hc")).toBe("AQVN…b7Hc");
    expect(hintFor("short")).toBe("••••hort");
  });
});
