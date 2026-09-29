import type { Db } from "@metobe/db/client";
import { describe, expect, it } from "vitest";

import { buildAuthOptions } from "./auth-options";

const options = buildAuthOptions({
  db: {} as Db,
  sendAccountCode: () => Promise.resolve(),
  sendSignInCode: () => Promise.resolve(),
});

describe("the account's sign-in rules", () => {
  it("has no fresh-session rule", () => {
    expect(options.session.freshAge).toBe(0);
    const [otp] = options.plugins;
    expect(otp?.id).toBe("email-otp");
  });
});
