import { describe, expect, it } from "vitest";

import { domainOf, domainSchema, isPublicMailDomain } from "./access";

describe("a domain people may sign in with", () => {
  it("takes a name as people type it", () => {
    expect(domainSchema.parse("  Kaminsoft.RU ")).toBe("kaminsoft.ru");
    expect(domainSchema.parse("@kaminsoft.ru")).toBe("kaminsoft.ru");
  });

  it.each([
    "kaminsoft",
    "kamin soft.ru",
    "a@b.ru",
    "https://kaminsoft.ru",
    ".ru",
    "ru.",
    "-a.ru",
    "a..ru",
    "",
  ])("refuses %j", (value) => {
    expect(domainSchema.safeParse(value).success).toBe(false);
  });

  it("knows the services anyone can have an address on", () => {
    for (const d of [
      "gmail.com",
      "yandex.ru",
      "mail.ru",
      "outlook.com",
      "icloud.com",
    ]) {
      expect(isPublicMailDomain(d)).toBe(true);
    }
    expect(isPublicMailDomain("kaminsoft.ru")).toBe(false);
  });
});

describe("the domain of an address", () => {
  it("is what follows the last @, in lower case", () => {
    expect(domainOf("Anna@Kaminsoft.RU")).toBe("kaminsoft.ru");
    expect(domainOf("a@b@kaminsoft.ru")).toBe("kaminsoft.ru");
  });

  it("is nothing for what is not an address", () => {
    expect(domainOf("kaminsoft.ru")).toBeNull();
    expect(domainOf("anna@")).toBeNull();
  });
});
