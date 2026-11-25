import type { RequestContext } from "@metobe/core/context";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const loadContext = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
}));
vi.mock("@/lib/auth", () => ({ getAuth: () => ({ api: { getSession } }) }));
vi.mock("@metobe/core/context", () => ({ loadContext }));

const {
  getActiveContext,
  getContext,
  requireContext,
  requireOrgAdmin,
  requirePlatform,
  requirePlatformRoute,
} = await import("./context");

const person = (over: Partial<RequestContext> = {}): RequestContext => ({
  gate: null,
  orgDisabledReason: null,
  orgId: "org-1",
  orgName: "acme.example",
  orgRole: "member",
  orgStatus: "active",
  platformRole: "user",
  userId: "u1",
  ...over,
});

const signIn = (ctx: RequestContext | null) => {
  getSession.mockResolvedValue({
    session: { token: "tok" },
    user: { id: "u1", name: "Анна" },
  });
  loadContext.mockResolvedValue(ctx);
};

beforeEach(() => {
  getSession.mockReset();
  loadContext.mockReset();
});

const answer = async () => {
  const response = await requireContext();
  if (!(response instanceof Response)) {
    throw new Error("expected a response");
  }
  return { body: await response.json(), status: response.status };
};

describe("the context of a request", () => {
  it("is the signed-in person with their organization, both roles and their session", async () => {
    signIn(person({ orgRole: "admin" }));
    expect(await getContext()).toMatchObject({
      orgId: "org-1",
      orgRole: "admin",
      platformRole: "user",
      sessionToken: "tok",
      user: { name: "Анна" },
      userId: "u1",
    });
  });

  it("is nobody's without a session, and without a row for the person", async () => {
    getSession.mockResolvedValue(null);
    expect(await getContext()).toBeNull();
    signIn(null);
    expect(await getContext()).toBeNull();
  });

  it("answers an API call 401 for nobody", async () => {
    getSession.mockResolvedValue(null);
    expect(await answer()).toEqual({
      body: { error: "unauthorized" },
      status: 401,
    });
  });

  it.each(["org-disabled", "blocked"] as const)(
    "answers an API call 403 `org-disabled` behind the gate %s",
    async (gate) => {
      signIn(person({ gate }));
      expect(await answer()).toEqual({
        body: { error: "org-disabled", reason: gate },
        status: 403,
      });
    }
  );

  it("hands an API call the context when nothing is off", async () => {
    signIn(person());
    expect(await requireContext()).toMatchObject({ userId: "u1" });
  });

  it("gives an action nobody behind a gate", async () => {
    signIn(person({ gate: "blocked" }));
    expect(await getActiveContext()).toBeNull();
    signIn(person());
    expect(await getActiveContext()).not.toBeNull();
  });
});

describe("platform-only routes (the update, the dump of the base)", () => {
  it.each(["superuser", "admin"] as const)(
    "let the platform's %s in",
    async (platformRole) => {
      signIn(person({ platformRole }));
      expect(await requirePlatformRoute()).toMatchObject({ userId: "u1" });
    }
  );

  it.each(["owner", "admin", "member"] as const)(
    "answer 404 to an organization's %s — the route is not there for them",
    async (orgRole) => {
      signIn(person({ orgRole, platformRole: "user" }));
      const response = await requirePlatformRoute();
      expect(response).toBeInstanceOf(Response);
      expect((response as Response).status).toBe(404);
      expect(await (response as Response).json()).toEqual({
        error: "not found",
      });
    }
  );

  it("answer 401 to nobody", async () => {
    getSession.mockResolvedValue(null);
    expect(((await requirePlatformRoute()) as Response).status).toBe(401);
  });

  it("answer 403 behind a gate, even to the platform's staff", async () => {
    signIn(person({ gate: "blocked", platformRole: "admin" }));
    expect(((await requirePlatformRoute()) as Response).status).toBe(403);
  });
});

describe("actions of the platform and of an organization", () => {
  it("are the platform staff's", async () => {
    signIn(person({ platformRole: "admin" }));
    await expect(requirePlatform()).resolves.toMatchObject({ userId: "u1" });
    signIn(person({ orgRole: "owner", platformRole: "user" }));
    await expect(requirePlatform()).rejects.toThrow("forbidden");
  });

  it.each(["owner", "admin"] as const)(
    "are the organization %s's",
    async (orgRole) => {
      signIn(person({ orgRole }));
      await expect(requireOrgAdmin()).resolves.toMatchObject({
        userId: "u1",
      });
    }
  );

  it("are not a member's", async () => {
    signIn(person({ orgRole: "member", platformRole: "user" }));
    await expect(requireOrgAdmin()).rejects.toThrow("forbidden");
  });

  it("are nobody's behind a gate", async () => {
    signIn(
      person({
        gate: "org-disabled",
        orgRole: "owner",
        platformRole: "superuser",
      })
    );
    await expect(requirePlatform()).rejects.toThrow("forbidden");
    await expect(requireOrgAdmin()).rejects.toThrow("forbidden");
  });
});
