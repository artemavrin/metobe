import { describe, expect, it } from "vitest";

import { labelType, toneOf } from "./label-tone";

describe("a label's colour", () => {
  it("reads the kind from the label, a person's in any case form", () => {
    expect(labelType("[[PHONE_37c895]]")).toBe("PHONE");
    expect(labelType("[[BANK_ACCOUNT_88aa01]]")).toBe("BANK_ACCOUNT");
    expect(labelType("[[DATE_OF_BIRTH_2d7c55]]")).toBe("DATE_OF_BIRTH");
    expect(labelType("Персона_Мужчина_9580c4")).toBe("PERSON");
    expect(labelType("Персоне_Женщине_7f3a01")).toBe("PERSON");
  });

  it("gives a kind its own colour and anything else the grey chip", () => {
    expect(toneOf("PHONE").chip).toContain("amber");
    expect(toneOf(labelType("просто текст")).chip).toContain("foreground");
    expect(toneOf("ORGANIZATION").chip).toContain("foreground");
  });
});
