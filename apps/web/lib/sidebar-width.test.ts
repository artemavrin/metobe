import { describe, expect, it } from "vitest";

import {
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  clampSidebarWidth,
  parseSidebarWidth,
} from "./sidebar-width";

describe("the sidebar's width", () => {
  it("keeps a width between the narrowest and the widest", () => {
    expect(clampSidebarWidth(100)).toBe(SIDEBAR_MIN);
    expect(clampSidebarWidth(900)).toBe(SIDEBAR_MAX);
    expect(clampSidebarWidth(300.4)).toBe(300);
  });

  it("reads a cookie, and takes anything else as not set", () => {
    expect(parseSidebarWidth("320")).toBe(320);
    expect(parseSidebarWidth("9999")).toBe(SIDEBAR_MAX);
    expect(parseSidebarWidth()).toBeNull();
    expect(parseSidebarWidth("")).toBeNull();
    expect(parseSidebarWidth(null)).toBeNull();
    expect(parseSidebarWidth("wide")).toBeNull();
    expect(parseSidebarWidth("-5")).toBeNull();
  });
});
