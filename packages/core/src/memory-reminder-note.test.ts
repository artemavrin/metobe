import { describe, expect, it } from "vitest";

import { reminderNote } from "./memory-reminder-note";

describe("what the chat says of reminders (D43)", () => {
  it("tells the model a reminder is set by the memory and where it goes", () => {
    expect(reminderNote({ mail: false, telegram: true })).toContain(
      "to their Telegram."
    );
    expect(reminderNote({ mail: true, telegram: false })).toContain(
      "to their mail."
    );
    expect(reminderNote({ mail: true, telegram: true })).toContain(
      "to their Telegram and to their mail."
    );
  });

  it("says so when it goes nowhere, and points to the settings", () => {
    const text = reminderNote({ mail: false, telegram: false });
    expect(text).toContain("only show on their start screen");
    expect(text).toContain("«Уведомления»");
    expect(text).not.toContain("to their Telegram");
  });

  it("forbids «I cannot remind» and the timer", () => {
    const text = reminderNote({ mail: true, telegram: true });
    expect(text).toContain("Never say you cannot remind");
    expect(text).toContain("set a timer or an alarm");
  });
});
