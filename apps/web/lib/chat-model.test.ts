import { describe, expect, it } from "vitest";

import { pickModel } from "./chat-model";

const models = [{ id: "new" }, { id: "used" }, { id: "old" }];

describe("the model a chat opens with", () => {
  it("keeps the first preferred model that is still in chat", () => {
    expect(pickModel(models, ["gone", "used", "old"])?.id).toBe("used");
    expect(pickModel(models, [null, undefined, "old"])?.id).toBe("old");
  });

  it("falls back to the newest model, or nothing when chat is empty", () => {
    expect(pickModel(models, ["gone"])?.id).toBe("new");
    expect(pickModel([], ["used"])).toBeUndefined();
  });
});
