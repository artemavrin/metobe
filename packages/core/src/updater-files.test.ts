import { describe, expect, it } from "vitest";

import {
  backupsToDrop,
  composeHasUpdater,
  envValue,
  imageRepo,
  pinImage,
  profilesOf,
  withGuardKeys,
  withProfile,
} from "./updater-files";

describe("imageRepo", () => {
  it("drops the tag, not a registry's port", () => {
    expect(imageRepo("ghcr.io/artemavrin/metobe:0.4.0")).toBe(
      "ghcr.io/artemavrin/metobe"
    );
    expect(imageRepo("localhost:5000/metobe:0.3.0")).toBe(
      "localhost:5000/metobe"
    );
    expect(imageRepo("localhost:5000/metobe")).toBe("localhost:5000/metobe");
    expect(imageRepo("metobe@sha256:abc")).toBe("metobe");
  });
});

describe("pinImage", () => {
  const env =
    "# Generated\nMETOBE_IMAGE=ghcr.io/x/metobe:0.3.0\nAPP_PORT=3000\n";

  it("replaces the pinned image and keeps the rest", () => {
    const next = pinImage(env, "ghcr.io/x/metobe:0.4.0");
    expect(next).toBe(
      "# Generated\nMETOBE_IMAGE=ghcr.io/x/metobe:0.4.0\nAPP_PORT=3000\n"
    );
    expect(envValue(next, "METOBE_IMAGE")).toBe("ghcr.io/x/metobe:0.4.0");
  });

  it("adds one when there was none", () => {
    expect(pinImage("APP_PORT=3000", "m:1")).toBe(
      "APP_PORT=3000\nMETOBE_IMAGE=m:1\n"
    );
  });
});

describe("envValue", () => {
  it("takes the last line, as compose does", () => {
    expect(envValue("A=1\nB=2\nA=3\n", "A")).toBe("3");
    expect(envValue("AB=1\n", "A")).toBeNull();
  });
});

describe("backupsToDrop", () => {
  it("keeps the newest copies and touches nothing else", () => {
    const files = [
      { mtimeMs: 1, name: "metobe-0.1.0-a.dump" },
      { mtimeMs: 4, name: "metobe-0.4.0-d.dump" },
      { mtimeMs: 2, name: "metobe-0.2.0-b.dump" },
      { mtimeMs: 0, name: "notes.txt" },
      { mtimeMs: 3, name: "metobe-0.3.0-c.dump" },
    ];
    expect(backupsToDrop(files, 3)).toEqual(["metobe-0.1.0-a.dump"]);
  });
});

describe("composeHasUpdater", () => {
  it("finds the updater service", () => {
    expect(
      composeHasUpdater("services:\n  app: {}\n  updater:\n    image: x\n")
    ).toBe(true);
    expect(composeHasUpdater("services:\n  app: {}\n")).toBe(false);
    expect(composeHasUpdater(": not yaml [")).toBe(false);
  });
});

describe("withGuardKeys", () => {
  it("makes the keys an older install lacks and keeps the ones it has", () => {
    let n = 0;
    const make = () => `k${(n += 1)}`;
    expect(withGuardKeys("APP_PORT=3000\n", make)).toBe(
      "APP_PORT=3000\nPII_GUARD_TENANT_KEY=k1\nPII_GUARD_API_TOKEN=k2\n"
    );
    const full = "PII_GUARD_TENANT_KEY=a\nPII_GUARD_API_TOKEN=b\n";
    expect(withGuardKeys(full, make)).toBe(full);
    expect(
      withGuardKeys("PII_GUARD_TENANT_KEY=\nPII_GUARD_API_TOKEN=b\n", make)
    ).toBe("PII_GUARD_TENANT_KEY=k3\nPII_GUARD_API_TOKEN=b\n");
  });
});

describe("withProfile", () => {
  it("adds a profile once, takes it out, and writes the line when there was none", () => {
    const env = "COMPOSE_PROFILES=db,s3,updater\nAPP_PORT=3000\n";
    const on = withProfile(env, "pii", true);
    expect(envValue(on, "COMPOSE_PROFILES")).toBe("db,s3,updater,pii");
    expect(withProfile(on, "pii", true)).toBe(on);
    expect(withProfile(on, "pii", false)).toBe(env);
    expect(profilesOf(withProfile("APP_PORT=3000\n", "pii", true))).toEqual([
      "pii",
    ]);
  });
});
