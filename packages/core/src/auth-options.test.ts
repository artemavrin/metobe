import type { Db } from "@metobe/db/client";
import { describe, expect, it } from "vitest";

import { buildAuthOptions } from "./auth-options";

const options = buildAuthOptions({
  canSignUp: (email) => Promise.resolve(email.endsWith("@kaminsoft.ru")),
  db: {} as Db,
  sendAccountCode: () => Promise.resolve(),
  sendSignInCode: () => Promise.resolve(),
});

const person = (email: string) => ({
  createdAt: new Date(),
  email,
  emailVerified: true,
  id: "u",
  name: "",
  updatedAt: new Date(),
});

describe("the account's sign-in rules", () => {
  it("has no fresh-session rule", () => {
    expect(options.session.freshAge).toBe(0);
    const [otp] = options.plugins;
    expect(otp?.id).toBe("email-otp");
  });

  it("makes an account only for an address that may have one", async () => {
    const { before } = options.databaseHooks.user.create;
    await expect(before(person("anna@kaminsoft.ru"))).resolves.toMatchObject({
      data: { email: "anna@kaminsoft.ru" },
    });
    await expect(before(person("eve@example.com"))).resolves.toBe(false);
  });
});
