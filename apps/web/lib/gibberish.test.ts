import { describe, expect, it } from "vitest";

import { glyphFor, scrambled, settleFrames, settling } from "./gibberish";

const seq = (...values: number[]) => {
  let index = 0;
  return () => {
    const value = values[index % values.length] ?? 0;
    index += 1;
    return value;
  };
};

describe("the letters of a title being named", () => {
  it("keeps the script and the case of each letter", () => {
    expect(glyphFor("п", seq(0))).toBe("а");
    expect(glyphFor("П", seq(0))).toBe("А");
    expect(glyphFor("k", seq(0.99))).toBe("z");
    expect(glyphFor("K", seq(0))).toBe("A");
    expect(glyphFor("7", seq(0.5))).toMatch(/\d/u);
  });

  it("leaves spaces and marks alone", () => {
    expect(scrambled("а б, в—г!")).toMatch(/^. ., .—.!$/u);
    expect(glyphFor(" ")).toBe(" ");
    expect(glyphFor("—")).toBe("—");
  });

  it("gives every letter 5 to 14 frames", () => {
    const frames = settleFrames("Погода в Калуге", seq(0, 0.999, 0.5));
    expect(Math.min(...frames)).toBe(5);
    expect(Math.max(...frames)).toBe(14);
  });

  it("settles letter by letter into the text", () => {
    const frames = [1, 3, 5];
    expect(settling("abc", frames, 0, seq(0))).toBe("aaa");
    expect(settling("abc", frames, 3, seq(0))).toBe("aba");
    expect(settling("abc", frames, 5)).toBe("abc");
  });
});
