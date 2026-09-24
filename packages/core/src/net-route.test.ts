import { describe, expect, it } from "vitest";

import { covers, resolveRoute } from "./net-route";

const domains = [
  { domain: "openai.com", proxyId: "corp" },
  { domain: "api.openai.com", proxyId: "ams" },
  { domain: "anthropic.com", proxyId: "off" },
];
const enabled = new Set(["corp", "ams"]);

describe("route selection (ARCH §18.2)", () => {
  it("goes direct by default", () => {
    expect(
      resolveRoute(null, "llm.api.cloud.yandex.net", domains, enabled)
    ).toEqual({ kind: "direct", why: "no-match" });
    expect(
      resolveRoute({ mode: "auto" }, "example.com", domains, enabled).kind
    ).toBe("direct");
  });

  it("honours an explicit choice over domains", () => {
    expect(
      resolveRoute({ mode: "direct" }, "api.openai.com", domains, enabled)
    ).toEqual({ kind: "direct", why: "explicit" });
    expect(
      resolveRoute(
        { mode: "proxy", proxyId: "corp" },
        "llm.api.cloud.yandex.net",
        domains,
        enabled
      )
    ).toMatchObject({
      proxyId: "corp",
      why: "explicit",
    });
  });

  it("picks the most specific domain", () => {
    expect(
      resolveRoute({ mode: "auto" }, "api.openai.com", domains, enabled)
    ).toMatchObject({ domain: "api.openai.com", proxyId: "ams" });
    expect(
      resolveRoute({ mode: "auto" }, "files.openai.com", domains, enabled)
    ).toMatchObject({ domain: "openai.com", proxyId: "corp" });
  });

  it("ignores disabled proxies, explicit or by domain", () => {
    expect(
      resolveRoute({ mode: "auto" }, "api.anthropic.com", domains, enabled).kind
    ).toBe("direct");
    expect(
      resolveRoute(
        { mode: "proxy", proxyId: "off" },
        "api.anthropic.com",
        domains,
        enabled
      ).kind
    ).toBe("direct");
  });

  it("covers subdomains but not look-alikes", () => {
    expect(covers("openai.com", "api.openai.com")).toBe(true);
    expect(covers("openai.com", "openai.com")).toBe(true);
    expect(covers("openai.com", "notopenai.com")).toBe(false);
  });
});
