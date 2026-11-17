import { beforeEach, describe, expect, it, vi } from "vitest";

// Where the settings window returns and how: kept outside the window, since Next mounts it anew on every section.

const load = async () => {
  vi.resetModules();
  return await import("./last-page");
};

describe("the page under the settings window", () => {
  let m: Awaited<ReturnType<typeof load>>;
  beforeEach(async () => {
    m = await load();
  });

  it("remembers the page with its query and counts one settings screen", () => {
    m.notePath("/chat/1", "/chat/1?q=x");
    m.notePath("/settings/service", "/settings/service");
    expect(m.lastPage()).toBe("/chat/1?q=x");
    expect(m.settingsSteps()).toBe(1);
  });

  it("counts each section gone through, and the same path twice once", () => {
    m.notePath("/chat/1", "/chat/1");
    m.notePath("/settings/service", "/settings/service");
    m.notePath("/settings/service", "/settings/service");
    m.notePath("/settings/privacy", "/settings/privacy");
    expect(m.settingsSteps()).toBe(2);
    expect(m.lastPage()).toBe("/chat/1");
  });

  it("starts over once the window is closed", () => {
    m.notePath("/settings/service", "/settings/service");
    m.notePath("/settings/privacy", "/settings/privacy");
    m.notePath("/chat/2", "/chat/2");
    expect(m.settingsSteps()).toBe(0);
    m.notePath("/settings/search", "/settings/search");
    expect(m.settingsSteps()).toBe(1);
  });
});
