import { describe, expect, it, vi } from "vitest";

import {
  mountSettingsWindow,
  settingsWindowInPage,
  settingsWindowOver,
  subscribeSettingsWindows,
} from "./settings-window";

// Settings opened by their address, then a section picked in them: the window over the page takes the place of the
// one in it (components/settings/settings-shell).

describe("the settings windows hand over", () => {
  it("knows a window in the page, then one over it, and tells each change", () => {
    const heard = vi.fn();
    const unsubscribe = subscribeSettingsWindows(heard);
    const leavePage = mountSettingsWindow(false);
    expect(settingsWindowInPage()).toBe(true);
    expect(settingsWindowOver()).toBe(false);
    const leaveOver = mountSettingsWindow(true);
    expect(settingsWindowOver()).toBe(true);
    leaveOver();
    expect(settingsWindowOver()).toBe(false);
    expect(settingsWindowInPage()).toBe(true);
    leavePage();
    expect(settingsWindowInPage()).toBe(false);
    expect(heard).toHaveBeenCalledTimes(4);
    unsubscribe();
    mountSettingsWindow(true)();
    expect(heard).toHaveBeenCalledTimes(4);
  });
});
