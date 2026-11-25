import { modelRuns } from "@metobe/db/schema/models";
import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

// What was spent stays spent: deleting a chat, an account or a model must never take its runs — and their cost — out
// of the usage. The runs let go of what they pointed at (SET NULL) and stay; a cascade here would rewrite the past. An
// organization with runs is not deleted at all (RESTRICT): it is turned off (D48).

describe("the usage outlives what it was spent on", () => {
  const { foreignKeys } = getTableConfig(modelRuns);

  const onDelete = (table: string) =>
    foreignKeys.find(
      (key) => getTableName(key.reference().foreignTable) === table
    )?.onDelete;

  it("points at a chat, a user, a model and an organization", () => {
    expect(foreignKeys).toHaveLength(4);
  });

  it("lets go of each of them on delete, and never goes with them", () => {
    expect(onDelete("chats")).toBe("set null");
    expect(onDelete("user")).toBe("set null");
    expect(onDelete("models")).toBe("set null");
    expect(onDelete("organizations")).toBe("restrict");
  });
});
