import { modelRuns } from "@metobe/db/schema/models";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

// What was spent stays spent: deleting a chat, an account or a model must never take its runs — and their cost — out
// of the usage. The runs let go of what they pointed at (SET NULL) and stay; a cascade here would rewrite the past.

describe("the usage outlives what it was spent on", () => {
  const { foreignKeys } = getTableConfig(modelRuns);

  it("points at a chat, a user and a model", () => {
    expect(foreignKeys).toHaveLength(3);
  });

  it("lets go of each of them on delete, and never goes with them", () => {
    for (const key of foreignKeys) {
      expect(key.onDelete).toBe("set null");
    }
  });
});
