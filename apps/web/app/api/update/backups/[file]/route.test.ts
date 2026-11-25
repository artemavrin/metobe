import { Readable } from "node:stream";

import type { RequestContext } from "@metobe/core/context";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const loadContext = vi.fn();
const readUpdateRun = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
}));
vi.mock("@/lib/auth", () => ({ getAuth: () => ({ api: { getSession } }) }));
vi.mock("@metobe/core/context", () => ({ loadContext }));
vi.mock("@metobe/core/updater-bus", () => ({ readUpdateRun }));
// A dump on the volume: the platform's staff get its bytes, anyone else never gets to the file.
vi.mock("node:fs/promises", () => ({
  stat: () => Promise.resolve({ isFile: () => true, size: 4 }),
}));
vi.mock("node:fs", () => ({
  createReadStream: () => Readable.from([Buffer.from("dump")]),
}));

const backups = await import("./route");
const update = await import("../../route");

const FILE = "metobe-0.11.5-20261125T090000Z.dump";
const asking = (file = FILE) =>
  backups.GET(new Request("http://localhost/api/update/backups/x"), {
    params: Promise.resolve({ file }),
  });

const signIn = (over: Partial<RequestContext>) => {
  getSession.mockResolvedValue({ session: { token: "t" }, user: { id: "u1" } });
  loadContext.mockResolvedValue({
    gate: null,
    orgDisabledReason: null,
    orgId: "org-1",
    orgName: "acme.example",
    orgRole: "member",
    orgStatus: "active",
    platformRole: "user",
    userId: "u1",
    ...over,
  } satisfies RequestContext);
};

beforeEach(() => {
  getSession.mockReset();
  loadContext.mockReset();
  readUpdateRun.mockReset();
  readUpdateRun.mockResolvedValue(null);
});

describe("GET /api/update/backups/[file] — the dump of the whole base", () => {
  it.each(["superuser", "admin"] as const)(
    "gives it to the platform's %s",
    async (platformRole) => {
      signIn({ platformRole });
      const response = await asking();
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("dump");
    }
  );

  it.each(["owner", "admin", "member"] as const)(
    "is a 404 for an organization's %s",
    async (orgRole) => {
      signIn({ orgRole, platformRole: "user" });
      const response = await asking();
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "not found" });
    }
  );

  it("is a 401 for nobody signed in", async () => {
    getSession.mockResolvedValue(null);
    const response = await asking();
    expect(response.status).toBe(401);
  });

  it("is a 403 behind a gate", async () => {
    signIn({ gate: "org-disabled", platformRole: "admin" });
    const response = await asking();
    expect(response.status).toBe(403);
  });

  it("is still a 404 for a name that is no dump of ours", async () => {
    signIn({ platformRole: "superuser" });
    const response = await asking("../etc/passwd");
    expect(response.status).toBe(404);
  });
});

describe("GET /api/update — how the update goes", () => {
  it("is the platform's: a 404 for an organization's admin", async () => {
    signIn({ platformRole: "admin" });
    const staff = await update.GET();
    expect(staff.status).toBe(200);
    signIn({ orgRole: "admin", platformRole: "user" });
    const admin = await update.GET();
    expect(admin.status).toBe(404);
    expect(readUpdateRun).toHaveBeenCalledTimes(1);
  });
});
