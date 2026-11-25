import { describe, expect, it } from "vitest";

import {
  canChangeRole,
  canInvite,
  canManageAccess,
  canManageOrganizations,
  canManageOrgSettings,
  canManagePlatform,
  canManageSeats,
  canRemove,
  canSeeMoney,
  canSeeTeamUsage,
  isOrgManager,
  isOrgRole,
  isPlatformRole,
  isRole,
  orgRoleFor,
} from "./members";
import type { Roles } from "./members";

// The table of rights of ORGS-PLAN §4, row by row, for every person it names. The superuser of a cloud sits in their
// own organization as its owner; the platform's staff are `admin` in the install and plain members of theirs;
// `selfAdmin` is an install's admin of a self-hosted one — both at once.
const people = {
  member: { orgRole: "member", role: "user" },
  orgAdmin: { orgRole: "admin", role: "user" },
  owner: { orgRole: "owner", role: "user" },
  selfAdmin: { orgRole: "admin", role: "admin" },
  staff: { orgRole: "member", role: "admin" },
  superuser: { orgRole: "owner", role: "superuser" },
} satisfies Record<string, Roles>;
type Person = keyof typeof people;
const names = Object.keys(people) as Person[];

/** What a rule says for each person; the people it lists are the ones it lets through. */
const allowed = (rule: (actor: Roles) => boolean) =>
  names.filter((name) => rule(people[name]));

describe("the table of rights (ORGS-PLAN §4)", () => {
  it("platform: sources, models, prices, proxies, mail, storage, updates and the dump of the base", () => {
    expect(allowed(canManagePlatform)).toEqual([
      "selfAdmin",
      "staff",
      "superuser",
    ]);
    expect(isPlatformRole("superuser")).toBe(true);
    expect(isPlatformRole("admin")).toBe(true);
    expect(isPlatformRole("user")).toBe(false);
  });

  it("making, turning off and on organizations and people, tariffs, rates, invoices: the superuser only", () => {
    expect(allowed(canManageOrganizations)).toEqual(["superuser"]);
  });

  it("seats by tariff and a person's tariff: the superuser and the owner of that organization", () => {
    expect(allowed((a) => canManageSeats(a, true))).toEqual([
      "owner",
      "superuser",
    ]);
    expect(allowed((a) => canManageSeats(a, false))).toEqual(["superuser"]);
  });

  it("the organization's settings: its owner and admins, the superuser only as one of them", () => {
    expect(allowed((a) => canManageOrgSettings(a, true))).toEqual([
      "orgAdmin",
      "owner",
      "selfAdmin",
      "superuser",
    ]);
    expect(allowed((a) => canManageOrgSettings(a, false))).toEqual([]);
    expect(isOrgManager("owner")).toBe(true);
    expect(isOrgManager("admin")).toBe(true);
    expect(isOrgManager("member")).toBe(false);
  });

  it("the team's use: the superuser anywhere, the owner and admins in their own organization", () => {
    expect(allowed((a) => canSeeTeamUsage(a, true))).toEqual([
      "orgAdmin",
      "owner",
      "selfAdmin",
      "superuser",
    ]);
    expect(allowed((a) => canSeeTeamUsage(a, false))).toEqual(["superuser"]);
  });

  it("money: the platform always, the organization's people only without tariffs", () => {
    expect(allowed((a) => canSeeMoney(a, true))).toEqual([
      "selfAdmin",
      "staff",
      "superuser",
    ]);
    expect(allowed((a) => canSeeMoney(a, false))).toEqual(names);
  });

  describe("inviting", () => {
    it("lets the owner invite admins and users, an admin only users, a member nobody", () => {
      for (const role of ["admin", "user"] as const) {
        expect(allowed((a) => canInvite(a, role, true))).toEqual(
          role === "admin"
            ? ["owner", "superuser"]
            : ["orgAdmin", "owner", "selfAdmin", "superuser"]
        );
      }
    });

    it("lets the superuser invite users into another organization, never admins", () => {
      expect(allowed((a) => canInvite(a, "user", false))).toEqual([
        "superuser",
      ]);
      expect(allowed((a) => canInvite(a, "admin", false))).toEqual([]);
    });
  });

  describe("changing a role (naming admins, handing over ownership)", () => {
    it("is the owner's, in their own organization", () => {
      for (const target of ["member", "orgAdmin"] as const) {
        expect(allowed((a) => canChangeRole(a, people[target], true))).toEqual([
          "owner",
          "superuser",
        ]);
        expect(allowed((a) => canChangeRole(a, people[target], false))).toEqual(
          []
        );
      }
    });

    it("never touches an owner's role", () => {
      for (const target of ["owner", "superuser"] as const) {
        expect(allowed((a) => canChangeRole(a, people[target], true))).toEqual(
          []
        );
      }
    });
  });

  describe("removing and turning off people, handing out sign-in links", () => {
    it("lets the owner remove admins and members, an admin only members", () => {
      expect(allowed((a) => canRemove(a, people.member, true))).toEqual([
        "orgAdmin",
        "owner",
        "selfAdmin",
        "superuser",
      ]);
      expect(allowed((a) => canRemove(a, people.orgAdmin, true))).toEqual([
        "owner",
        "superuser",
      ]);
    });

    it("lets nobody act on an owner or the superuser", () => {
      for (const target of ["owner", "superuser"] as const) {
        expect(allowed((a) => canRemove(a, people[target], true))).toEqual([]);
        expect(
          allowed((a) => canManageAccess(a, people[target], true))
        ).toEqual([]);
      }
    });

    it("lets the superuser act on the members of another organization, nobody else", () => {
      expect(allowed((a) => canRemove(a, people.member, false))).toEqual([
        "superuser",
      ]);
      expect(allowed((a) => canManageAccess(a, people.member, false))).toEqual([
        "superuser",
      ]);
      expect(allowed((a) => canRemove(a, people.orgAdmin, false))).toEqual([
        "superuser",
      ]);
    });
  });
});

describe("the roles themselves", () => {
  it("knows a role when it sees one", () => {
    expect(isRole("admin")).toBe(true);
    expect(isRole("root")).toBe(false);
    expect(isRole(null)).toBe(false);
  });

  it("gives the organization's role that goes with the install's", () => {
    expect(orgRoleFor("superuser")).toBe("owner");
    expect(orgRoleFor("admin")).toBe("admin");
    expect(orgRoleFor("user")).toBe("member");
    expect(isOrgRole("owner")).toBe(true);
    expect(isOrgRole("superuser")).toBe(false);
  });
});
