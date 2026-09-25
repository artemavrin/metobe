import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

import { SocksClient } from "socks";
import {
  Agent,
  buildConnector,
  Client,
  ProxyAgent,
  fetch as undiciFetch,
} from "undici";
import type { Dispatcher } from "undici";

/* oxlint-disable promise/prefer-await-to-callbacks, node/callback-return -- undici connectors are (opts, cb) by API */
// Transport for ARCH §18.4, proven in spike S4. `fetch` always comes from npm undici together with its dispatcher:
// Node's built-in fetch bundles another undici version.

export interface ProxyConfig {
  type: "http" | "https" | "socks5" | "socks5h";
  host: string;
  port: number;
  username?: string | null;
  password?: string | null;
}

type Connector = buildConnector.connector;
type Validate = (ip: string) => boolean;

/** A fetch bound to one dispatcher, in the shape AI SDK providers accept. */
export const fetchWith = (dispatcher: Dispatcher): typeof fetch =>
  ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
    undiciFetch(input as never, {
      ...(init as object),
      dispatcher,
    })) as unknown as typeof fetch;

/** «Direct» is an explicit Agent, so HTTPS_PROXY from the environment never leaks in. */
export const directAgent = () => new Agent();

// Private, loopback, link-local, CGNAT, multicast and reserved ranges: never a target for SSRF-guarded traffic.
const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

/** True for addresses on the public internet. IPv4-mapped IPv6 (::ffff:10.0.0.1) is checked as IPv4. */
export const isPublicAddress = (ip: string) => {
  const mapped = /^::ffff:(?<v4>\d+\.\d+\.\d+\.\d+)$/iu.exec(ip)?.groups?.v4;
  const address = mapped ?? ip;
  const family = isIP(address);
  if (!family) {
    return false;
  }
  return !blocked.check(address, family === 4 ? "ipv4" : "ipv6");
};

const portOf = (protocol: string, port: string) => {
  if (port) {
    return Number(port);
  }
  return protocol === "https:" ? 443 : 80;
};

/** Resolves the name ourselves and checks the address before any byte leaves; the tunnel then targets the IP. */
const pin = async (hostname: string, validate?: Validate) => {
  if (!validate) {
    return hostname;
  }
  let address = hostname;
  if (!isIP(hostname)) {
    const resolved = await lookup(hostname);
    ({ address } = resolved);
  }
  if (!validate(address)) {
    throw new Error(`blocked address ${address} for ${hostname}`);
  }
  return address;
};

const socksConnector = (proxy: ProxyConfig, validate?: Validate): Connector => {
  const tls = buildConnector({});
  return async (opts, cb) => {
    try {
      // socks5h hands the name to the proxy; socks5 and pinned traffic resolve locally.
      const host =
        validate || proxy.type === "socks5"
          ? await pin(opts.hostname, validate ?? (() => true))
          : opts.hostname;
      const { socket } = await SocksClient.createConnection({
        command: "connect",
        destination: { host, port: portOf(opts.protocol, opts.port) },
        proxy: {
          host: proxy.host,
          password: proxy.password ?? undefined,
          port: proxy.port,
          type: 5,
          userId: proxy.username ?? undefined,
        },
      });
      if (opts.protocol !== "https:") {
        cb(null, socket);
        return;
      }
      // SNI and certificate checks stay by name (opts.hostname).
      tls({ ...opts, httpSocket: socket }, cb);
    } catch (error) {
      cb(error as Error, null);
    }
  };
};

const proxyUrl = (proxy: ProxyConfig) => {
  const url = new URL(
    `${proxy.type === "https" ? "https" : "http"}://${proxy.host}:${proxy.port}`
  );
  if (proxy.username) {
    url.username = encodeURIComponent(proxy.username);
    url.password = encodeURIComponent(proxy.password ?? "");
  }
  return url;
};

const pinnedHttpConnector = (
  proxy: ProxyConfig,
  validate: Validate
): Connector => {
  const tls = buildConnector({});
  const url = proxyUrl(proxy);
  const auth = proxy.username
    ? `Basic ${Buffer.from(`${proxy.username}:${proxy.password ?? ""}`).toString("base64")}`
    : undefined;
  return async (opts, cb) => {
    try {
      const ip = await pin(opts.hostname, validate);
      const client = new Client(url.origin);
      const { socket, statusCode } = await client.connect({
        headers: auth ? { "proxy-authorization": auth } : {},
        path: `${isIP(ip) === 6 ? `[${ip}]` : ip}:${portOf(opts.protocol, opts.port)}`,
      });
      if (statusCode !== 200) {
        throw new Error(`proxy CONNECT answered ${statusCode}`);
      }
      if (opts.protocol !== "https:") {
        cb(null, socket as never);
        return;
      }
      tls({ ...opts, httpSocket: socket as never }, cb);
    } catch (error) {
      cb(error as Error, null);
    }
  };
};

/** A dispatcher for a proxy. With `pinned`, the destination must be public and the tunnel goes to the checked IP. */
export const proxyDispatcher = (
  proxy: ProxyConfig,
  { pinned = false } = {}
): Dispatcher => {
  if (pinned && proxy.type === "socks5h") {
    // The proxy would resolve the name itself and the address check would mean nothing (ARCH §18.4).
    throw new Error("socks5h cannot carry SSRF-guarded traffic");
  }
  if (proxy.type === "socks5" || proxy.type === "socks5h") {
    return new Agent({
      connect: socksConnector(proxy, pinned ? isPublicAddress : undefined),
    });
  }
  return pinned
    ? new Agent({ connect: pinnedHttpConnector(proxy, isPublicAddress) })
    : new ProxyAgent(proxyUrl(proxy).toString());
};

/** Direct but SSRF-guarded: the name is resolved and checked before connecting. */
export const pinnedDirectAgent = () => {
  const tcp = buildConnector({});
  return new Agent({
    connect: async (opts, cb) => {
      try {
        await pin(opts.hostname, isPublicAddress);
        tcp(opts, cb);
      } catch (error) {
        cb(error as Error, null);
      }
    },
  });
};

/** Parses HTTPS_PROXY / ALL_PROXY (`http://user:pass@host:3128`, `socks5h://host:1080`). */
export const parseProxyUrl = (value: string): ProxyConfig => {
  const url = new URL(value.trim());
  const scheme = url.protocol.replace(/:$/u, "");
  const type = (scheme === "socks" ? "socks5h" : scheme) as ProxyConfig["type"];
  if (!["http", "https", "socks5", "socks5h"].includes(type)) {
    throw new Error(`unsupported proxy scheme ${scheme}`);
  }
  let defaultPort = 8080;
  if (type === "https") {
    defaultPort = 443;
  } else if (type.startsWith("socks")) {
    defaultPort = 1080;
  }
  return {
    host: url.hostname,
    password: url.password ? decodeURIComponent(url.password) : null,
    port: url.port ? Number(url.port) : defaultPort,
    type,
    username: url.username ? decodeURIComponent(url.username) : null,
  };
};

/** What the admin types for a proxy: `host:port` (with the type picked beside it), or a full URL with a scheme and
 * credentials (`socks5://user:pass@host:1080`). Null when it is neither. */
export const parseProxyAddress = (
  value: string,
  type: ProxyConfig["type"]
): ProxyConfig | null => {
  const text = value.trim();
  if (text.includes("://")) {
    try {
      return parseProxyUrl(text);
    } catch {
      return null;
    }
  }
  const groups = /^(?<host>[\w.-]+):(?<port>\d{2,5})$/u.exec(text)?.groups;
  const port = Number(groups?.port);
  return groups?.host && port > 0 && port < 65_536
    ? { host: groups.host, port, type }
    : null;
};
