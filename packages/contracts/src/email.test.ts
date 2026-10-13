import { describe, expect, it } from "vitest";

import { policyOf } from "./email";

describe("policyOf", () => {
  it("takes the box's choice first, then the admin's default, then ours", () => {
    expect(policyOf({}, "email_send")).toBe("ask");
    expect(policyOf({}, "email_send", { email_send: "auto" })).toBe("auto");
    expect(
      policyOf({ email_send: "deny" }, "email_send", { email_send: "auto" })
    ).toBe("deny");
    expect(policyOf({}, "email_read", { email_send: "auto" })).toBe("auto");
    expect(policyOf({}, "email_read", { email_read: "ask" })).toBe("ask");
  });
});
