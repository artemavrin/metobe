import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// A real S3 for the round trip: `S3_TEST_ENDPOINT=http://localhost:8333` with the bundled SeaweedFS
// (docker compose --profile s3 up s3) and its keys in S3_TEST_ACCESS_KEY / S3_TEST_SECRET_KEY / S3_TEST_BUCKET.
const live = process.env.S3_TEST_ENDPOINT;

const KEYS = [
  "S3_ACCESS_KEY",
  "S3_BUCKET",
  "S3_ENDPOINT",
  "S3_FORCE_PATH_STYLE",
  "S3_REGION",
  "S3_SECRET_KEY",
] as const;

// Each test sees only the S3_* it gives (stubEnv with undefined unsets a variable); unstubbed after.
const load = async (env: Partial<Record<(typeof KEYS)[number], string>>) => {
  for (const k of KEYS) {
    vi.stubEnv(k, env[k]);
  }
  vi.resetModules();
  return await import("./storage");
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("storage config", () => {
  beforeEach(() => vi.resetModules());

  it("is off without a bucket or keys — the app runs, files are off", async () => {
    const storage = await load({ S3_BUCKET: "metobe" });
    expect(storage.getStorage()).toBeNull();
    expect(await storage.checkStorage()).toBe("off");
  });

  it("is on with a bucket and keys, path-style unless told otherwise", async () => {
    const storage = await load({
      S3_ACCESS_KEY: "a",
      S3_BUCKET: "metobe",
      S3_ENDPOINT: "http://s3:8333",
      S3_SECRET_KEY: "s",
    });
    const config = storage.getStorage();
    expect(config?.bucket).toBe("metobe");
    expect(await config?.client.config.forcePathStyle).toBe(true);
    expect(await config?.client.config.region()).toBe("us-east-1");
  });

  it("is down when the S3 does not answer", async () => {
    const storage = await load({
      S3_ACCESS_KEY: "a",
      S3_BUCKET: "metobe",
      S3_ENDPOINT: "http://127.0.0.1:1",
      S3_SECRET_KEY: "s",
    });
    expect(await storage.checkStorage()).toBe("down");
  });
});

describe.runIf(live)("storage against a real S3", () => {
  const env = {
    S3_ACCESS_KEY: process.env.S3_TEST_ACCESS_KEY ?? "metobe",
    S3_BUCKET: process.env.S3_TEST_BUCKET ?? "metobe",
    S3_ENDPOINT: live,
    S3_SECRET_KEY: process.env.S3_TEST_SECRET_KEY ?? "metobe-dev-secret",
  };

  it("answers health, writes, reads back, deletes a prefix", async () => {
    const storage = await load(env);
    expect(await storage.checkStorage()).toBe("ok");
    const prefix = `test/${crypto.randomUUID()}/`;
    const body = new TextEncoder().encode("вложение ".repeat(500));
    await storage.putObject(`${prefix}a.txt`, body, {
      contentLength: body.byteLength,
      contentType: "text/plain",
    });
    await storage.putObject(`${prefix}b.txt`, body, {
      contentLength: body.byteLength,
    });
    const got = await storage.getObject(`${prefix}a.txt`);
    expect(got?.contentType).toBe("text/plain");
    const back = new Uint8Array(await new Response(got?.body).arrayBuffer());
    expect(back).toEqual(body);
    expect(await storage.getObject(`${prefix}missing.txt`)).toBeNull();
    expect(await storage.deletePrefix(prefix)).toBe(2);
    expect(await storage.getObject(`${prefix}b.txt`)).toBeNull();
  });

  it("refuses a wrong secret", async () => {
    const storage = await load({ ...env, S3_SECRET_KEY: "wrong" });
    expect(await storage.checkStorage()).toBe("down");
  });
});
