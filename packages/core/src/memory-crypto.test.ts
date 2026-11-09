import { describe, expect, it } from "vitest";

import { memoryAad, newDataKey, openField, sealField } from "./memory-crypto";

describe("memory texts (ARCH §19.3)", () => {
  const key = newDataKey();
  const aad = memoryAad("user_1", "memory_records", "row_1", "body");

  it("round-trips a text with a fresh IV each time", () => {
    const a = sealField('{"text":"Ольга Ли обещала договор"}', aad, key);
    const b = sealField('{"text":"Ольга Ли обещала договор"}', aad, key);
    expect(openField(a, aad, key)).toBe('{"text":"Ольга Ли обещала договор"}');
    expect(a).not.toBe(b);
    expect(a.split(".")).toHaveLength(3);
  });

  it("does not show the text in the stored form", () => {
    const packed = sealField("Ольга Ли", aad, key);
    expect(packed).not.toContain("Ольга");
    expect(
      Buffer.from(packed.split(".")[2] ?? "", "base64").toString()
    ).not.toContain("Ольга");
  });

  it("refuses a text moved to another owner, table, row or field", () => {
    const packed = sealField("secret", aad, key);
    for (const moved of [
      memoryAad("user_2", "memory_records", "row_1", "body"),
      memoryAad("user_1", "memory_entities", "row_1", "body"),
      memoryAad("user_1", "memory_records", "row_2", "body"),
      memoryAad("user_1", "memory_records", "row_1", "title"),
    ]) {
      expect(() => openField(packed, moved, key)).toThrow();
    }
  });

  it("refuses another person's key", () => {
    const packed = sealField("secret", aad, key);
    expect(() => openField(packed, aad, newDataKey())).toThrow();
  });

  it("refuses tampering and a form it did not write", () => {
    const [iv, tag, ct] = sealField("secret", aad, key).split(".") as [
      string,
      string,
      string,
    ];
    const flipped = Buffer.from(ct, "base64");
    flipped[0] = flipped[0] === 0 ? 1 : 0;
    expect(() =>
      openField(`${iv}.${tag}.${flipped.toString("base64")}`, aad, key)
    ).toThrow();
    expect(() => openField("plain text", aad, key)).toThrow(/expected form/u);
    expect(() => openField(`${iv}.${tag}.${ct}.extra`, aad, key)).toThrow(
      /expected form/u
    );
  });
});
