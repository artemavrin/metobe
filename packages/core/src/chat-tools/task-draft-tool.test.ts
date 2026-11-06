import type { TaskDraft } from "@metobe/contracts/tasks";
import { describe, expect, it } from "vitest";

import { readDraft } from "./task-draft-tool";

const draft: TaskDraft = {
  cron: "0 9 * * 1-5",
  email: false,
  instructions: "Проверять цены трёх товаров у двух магазинов.",
  name: "Цены конкурентов",
  reportWhen: "changes",
  sources: null,
};
const ctx = {
  locale: "ru" as const,
  servers: [{ id: "c1", key: "crm", title: "CRM" }],
  timeZone: "Europe/Moscow",
};

describe("a drafted task", () => {
  it("says the schedule in words and counts the next runs in the person's zone", () => {
    const out = readDraft(draft, ctx, new Date("2026-11-27T10:00:00Z"));
    expect(out).toEqual({
      next: [
        "2026-11-30T06:00:00.000Z",
        "2026-12-01T06:00:00.000Z",
        "2026-12-02T06:00:00.000Z",
      ],
      ok: true,
      schedule: "По будням в 9:00",
      sources: null,
      timeZone: "Europe/Moscow",
    });
  });

  it("waits for a schedule that is not said yet", () => {
    const out = readDraft({ ...draft, cron: null }, ctx);
    expect(out.ok && out.schedule).toBeNull();
    expect(out.ok && out.next).toEqual([]);
  });

  it("sends a cron that does not parse back to the model", () => {
    expect(readDraft({ ...draft, cron: "every monday" }, ctx).ok).toBe(false);
  });

  it("sends a schedule more often than every five minutes back to the model", () => {
    expect(readDraft({ ...draft, cron: "*/2 * * * *" }, ctx).ok).toBe(false);
    expect(readDraft({ ...draft, cron: "*/5 * * * *" }, ctx).ok).toBe(true);
  });

  it("finds the sources by key or title and drops the unknown", () => {
    const out = readDraft({ ...draft, sources: ["CRM", "nowhere"] }, ctx);
    expect(out.ok && out.sources).toEqual([{ id: "c1", title: "CRM" }]);
    const builtIn = readDraft({ ...draft, sources: ["email", "web"] }, ctx);
    expect(builtIn.ok && builtIn.sources).toEqual([
      { id: "mail", title: "Почта" },
      { id: "web", title: "Сайты" },
    ]);
    const none = readDraft({ ...draft, sources: ["nowhere"] }, ctx);
    expect(none.ok && none.sources).toBeNull();
  });
});
