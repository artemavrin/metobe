import { describe, expect, it } from "vitest";

import { canConvert, convert } from "./price-units";

describe("moving a price between powers of ten", () => {
  it("shifts the decimal point exactly", () => {
    expect(convert("0.000003", 1, 1_000_000)).toBe("3");
    expect(convert("0.0000008", 1, 1_000_000)).toBe("0.8");
    expect(convert("0.00000375", 1, 1_000_000)).toBe("3.75");
    expect(convert("3", 1_000_000, 1000)).toBe("0.003");
    expect(convert("1.5", 1000, 1_000_000)).toBe("1500");
    expect(convert("0.000000000001", 1, 1_000_000)).toBe("0.000001");
  });

  it("leaves other units and odd input as they are", () => {
    expect(canConvert(500, 1_000_000)).toBe(false);
    expect(convert("2", 500, 1_000_000)).toBe("2");
    expect(convert("abc", 1, 1000)).toBe("abc");
  });
});
