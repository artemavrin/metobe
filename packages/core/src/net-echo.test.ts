import { describe, expect, it } from "vitest";

import { IP_ECHOES, probeExit } from "./net-echo";

const reply = (status: number, body: unknown) =>
  Response.json(body, { status });

/** A fetch answering each echo URL as told; a URL with no answer fails like a dead tunnel. */
const fake =
  (answers: Record<string, Response>): typeof fetch =>
  (url) => {
    const res = answers[String(url)];
    return res
      ? Promise.resolve(res)
      : Promise.reject(new TypeError("fetch failed"));
  };

const [ipinfo, ipify] = [IP_ECHOES[0], IP_ECHOES[2]].map((e) => e?.url);

describe("a proxy's exit", () => {
  it("is what the first echo says", async () => {
    expect(
      await probeExit(
        fake({ [ipinfo ?? ""]: reply(200, { country: "RU", ip: "1.2.3.4" }) })
      )
    ).toEqual({ country: "RU", ip: "1.2.3.4" });
  });

  it("asks the next echo when one is rate-limited — the proxy is not down for it", async () => {
    expect(
      await probeExit(
        fake({
          [ipinfo ?? ""]: reply(429, { error: "Rate limit hit" }),
          [ipify ?? ""]: reply(200, { ip: "1.2.3.4" }),
        })
      )
    ).toEqual({ ip: "1.2.3.4" });
  });

  it("works with its IP unknown when the echoes answer only with errors", async () => {
    const all = Object.fromEntries(
      IP_ECHOES.map((e) => [e.url, reply(429, {})])
    );
    expect(await probeExit(fake(all))).toEqual({});
  });

  it("is down only when no echo can be reached", async () => {
    await expect(probeExit(fake({}))).rejects.toThrow("fetch failed");
  });
});
