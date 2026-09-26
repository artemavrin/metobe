import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { configChanged, onConfigChange, receive } = await import("./config-bus");

const SOURCE = "7d6f5a2e-2b3c-4f1a-9b8e-1c2d3e4f5a6b";

describe("config:changed", () => {
  it("drops this process's caches at once, without Redis too", async () => {
    const heard: unknown[] = [];
    onConfigChange((change) => heard.push(change));
    await configChanged({ sourceId: SOURCE });
    await configChanged();
    expect(heard).toEqual([{ sourceId: SOURCE }, {}]);
  });

  it("drops them when another process says so", () => {
    const heard: unknown[] = [];
    onConfigChange((change) => heard.push(change));
    receive(JSON.stringify({ sourceId: SOURCE }));
    receive("{}");
    expect(heard).toEqual([{ sourceId: SOURCE }, {}]);
  });

  it("drops everything on a message it cannot read", () => {
    const heard: unknown[] = [];
    onConfigChange((change) => heard.push(change));
    receive("not json");
    receive(JSON.stringify({ sourceId: 42 }));
    expect(heard).toEqual([{}, {}]);
  });
});
