import { once } from "node:events";
import { createServer, request } from "node:http";
import type { Server } from "node:http";
import { connect } from "node:net";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  directAgent,
  fetchWith,
  isPublicAddress,
  parseProxyUrl,
  pinnedDirectAgent,
  proxyDispatcher,
} from "./net-transport";

describe("public address check (SSRF)", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.20.0.5",
    "192.168.0.26",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fd00::1",
    "fe80::1",
    "::ffff:10.0.0.1",
  ])("blocks %s", (ip) => expect(isPublicAddress(ip)).toBe(false));
  it.each(["93.184.215.14", "8.8.8.8", "2606:4700:4700::1111"])(
    "allows %s",
    (ip) => expect(isPublicAddress(ip)).toBe(true)
  );
});

describe("proxy URLs from the environment", () => {
  it("reads credentials, type and default ports", () => {
    expect(parseProxyUrl("http://svc:p%40ss@proxy.corp.local:3128")).toEqual({
      host: "proxy.corp.local",
      password: "p@ss",
      port: 3128,
      type: "http",
      username: "svc",
    });
    expect(parseProxyUrl("socks5h://51.15.0.7")).toMatchObject({
      port: 1080,
      type: "socks5h",
      username: null,
    });
    expect(() => parseProxyUrl("ftp://x:21")).toThrow(/unsupported/u);
  });
});

const port = (s: Server) => (s.address() as AddressInfo).port;

// A target server and a minimal HTTP CONNECT proxy on localhost: no external network in tests.
describe("fetch through an HTTP proxy", () => {
  let target: Server;
  let proxy: Server;
  const tunnels: string[] = [];

  beforeAll(async () => {
    target = createServer((_, res) => res.end("hello from target"));
    proxy = createServer((req, res) => {
      // Plain-HTTP proxying (absolute URL in the request line).
      const url = new URL(req.url ?? "");
      tunnels.push(`GET ${url.host}`);
      request(url, { headers: req.headers, method: req.method }, (up) =>
        up.pipe(res)
      ).end();
    });
    proxy.on("connect", (req, socket) => {
      tunnels.push(`CONNECT ${req.url}`);
      const [host, p] = (req.url ?? "").split(":");
      const up = connect(Number(p), host, () => {
        socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        up.pipe(socket);
        socket.pipe(up);
      });
    });
    target.listen(0, "127.0.0.1");
    proxy.listen(0, "127.0.0.1");
    await Promise.all([once(target, "listening"), once(proxy, "listening")]);
  });
  afterAll(() => {
    target.close();
    proxy.close();
  });

  it("reaches the target directly", async () => {
    const res = await fetchWith(directAgent())(
      `http://127.0.0.1:${port(target)}/`
    );
    expect(await res.text()).toBe("hello from target");
  });

  it("goes through the proxy when routed there", async () => {
    const via = proxyDispatcher({
      host: "127.0.0.1",
      port: port(proxy),
      type: "http",
    });
    const res = await fetchWith(via)(`http://127.0.0.1:${port(target)}/`);
    expect(await res.text()).toBe("hello from target");
    expect(tunnels.length).toBeGreaterThan(0);
  });

  it("refuses private targets for SSRF-guarded traffic, directly and through the proxy", async () => {
    const url = `http://127.0.0.1:${port(target)}/`;
    await expect(fetchWith(pinnedDirectAgent())(url)).rejects.toThrow();
    const pinned = proxyDispatcher(
      { host: "127.0.0.1", port: port(proxy), type: "http" },
      { pinned: true }
    );
    const before = tunnels.length;
    await expect(fetchWith(pinned)(url)).rejects.toThrow();
    // The check happens before the tunnel: the proxy never saw the request.
    expect(tunnels.length).toBe(before);
  });

  it("does not let socks5h carry SSRF-guarded traffic", () => {
    expect(() =>
      proxyDispatcher(
        { host: "x", port: 1080, type: "socks5h" },
        { pinned: true }
      )
    ).toThrow(/socks5h/u);
  });
});
