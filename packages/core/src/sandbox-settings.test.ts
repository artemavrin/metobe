import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { sandboxSettingsOf } = await import("./sandbox-settings");

const limits = {
  fileMb: 25,
  idleSeconds: 300,
  memoryMb: 1024,
  network: false,
  perUser: 1,
  runSeconds: 60,
  total: 4,
};

describe("sandbox settings (P35)", () => {
  it("is on with the service's own limits when nothing is saved", () => {
    expect(sandboxSettingsOf({})).toEqual({ enabled: true, limits: null });
  });

  it("reads what the admin saved", () => {
    expect(sandboxSettingsOf({ sandbox: { enabled: false, limits } })).toEqual({
      enabled: false,
      limits,
    });
  });

  it("drops limits a hand edit broke, keeping the switch", () => {
    expect(
      sandboxSettingsOf({
        sandbox: { enabled: false, limits: { ...limits, perUser: 9 } },
      })
    ).toEqual({ enabled: false, limits: null });
  });
});
