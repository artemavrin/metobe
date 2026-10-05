import { describe, expect, it } from "vitest";

import {
  canChangeRole,
  canInvite,
  canManageAccess,
  canRemove,
  isRole,
} from "./members";

describe("who may do what to whom", () => {
  it("lets the owner invite admins and users, an admin only users, a user nobody", () => {
    expect(canInvite("superuser", "admin")).toBe(true);
    expect(canInvite("superuser", "user")).toBe(true);
    expect(canInvite("admin", "user")).toBe(true);
    expect(canInvite("admin", "admin")).toBe(false);
    expect(canInvite("user", "user")).toBe(false);
  });

  it("lets only the owner change a role, and never an owner's", () => {
    expect(canChangeRole("superuser", "admin")).toBe(true);
    expect(canChangeRole("superuser", "user")).toBe(true);
    expect(canChangeRole("superuser", "superuser")).toBe(false);
    expect(canChangeRole("admin", "user")).toBe(false);
    expect(canChangeRole("user", "user")).toBe(false);
  });

  it("lets the owner remove anyone but an owner, an admin only users", () => {
    expect(canRemove("superuser", "admin")).toBe(true);
    expect(canRemove("superuser", "user")).toBe(true);
    expect(canRemove("superuser", "superuser")).toBe(false);
    expect(canRemove("admin", "user")).toBe(true);
    expect(canRemove("admin", "admin")).toBe(false);
    expect(canRemove("admin", "superuser")).toBe(false);
    expect(canRemove("user", "user")).toBe(false);
  });

  it("keeps an admin out of the owner's account, by a link or by turning it off", () => {
    expect(canManageAccess("superuser", "admin")).toBe(true);
    expect(canManageAccess("admin", "user")).toBe(true);
    expect(canManageAccess("admin", "superuser")).toBe(false);
    expect(canManageAccess("admin", "admin")).toBe(false);
    expect(canManageAccess("superuser", "superuser")).toBe(false);
  });

  it("knows a role when it sees one", () => {
    expect(isRole("admin")).toBe(true);
    expect(isRole("root")).toBe(false);
    expect(isRole(null)).toBe(false);
  });
});
