import type { Db } from "@metobe/db/client";
import { describe, expect, it } from "vitest";

import { buildAuthOptions } from "./auth-options";

const options = buildAuthOptions({
  canSignIn: (userId) => Promise.resolve(userId !== "off"),
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

const sessionOf = (userId: string) => ({
  createdAt: new Date(),
  expiresAt: new Date(),
  id: "s",
  token: "t",
  updatedAt: new Date(),
  userId,
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

  it("makes a session only for an account that is not turned off", async () => {
    const { before } = options.databaseHooks.session.create;
    await expect(before(sessionOf("on"))).resolves.toMatchObject({
      data: { userId: "on" },
    });
    await expect(before(sessionOf("off"))).resolves.toBe(false);
  });

  it("gives the accounts it makes a UUID, as the claim and invitations do", () => {
    expect(options.advanced.database.generateId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
    );
  });
});
