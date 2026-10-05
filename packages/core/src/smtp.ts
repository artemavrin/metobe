import "server-only";
import { MAIL_PRESETS } from "@metobe/contracts/email";
import type { MailPresetId, MailServer } from "@metobe/contracts/email";
import { createTransport } from "nodemailer";
import { SocksClient } from "socks";

// SMTP as both the service's own mail and a user's mailbox speak it: one transport, one reading of what a server
// said when it turned us away.

export const TIMEOUT_MS = 15_000;

/** Why a server turned us away, as the form and the model say it. */
export type MailProblem = "auth" | "unreachable" | "tls" | "private";

export const problemOf = (error: unknown): MailProblem => {
  const e = error as {
    authenticationFailed?: boolean;
    code?: string;
    responseCode?: number;
    message?: string;
  };
  const text = e.message ?? "";
  if (/blocked address/u.test(text)) {
    return "private";
  }
  if (
    e.authenticationFailed ||
    e.code === "EAUTH" ||
    e.responseCode === 535 ||
    /auth|login|credentials|password/iu.test(text)
  ) {
    return "auth";
  }
  if (/certificate|tls|ssl|self.signed/iu.test(text)) {
    return "tls";
  }
  return "unreachable";
};

export interface Credentials {
  username: string;
  password: string;
}

/** Where to connect: the address (a checked IP for a user's box), the name TLS checks, a proxy when routed so. */
interface Endpoint {
  host: string;
  servername: string;
  proxy?: string;
}

/** An SMTP transport; without `auth` — a server that lets us in by our address, as a relay inside the network. */
export const smtpTransport = (
  server: MailServer,
  auth: Credentials | null,
  at: Endpoint
) => {
  const transport = createTransport({
    ...(auth ? { auth: { pass: auth.password, user: auth.username } } : {}),
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    host: at.host,
    ignoreTLS: server.security === "none",
    port: server.port,
    ...(at.proxy ? { proxy: at.proxy } : {}),
    requireTLS: server.security === "starttls",
    secure: server.security === "ssl",
    // Connected by IP: the certificate is checked by the server's name.
    servername: at.servername,
    socketTimeout: TIMEOUT_MS,
    tls: { servername: at.servername },
  });
  if (at.proxy?.startsWith("socks")) {
    transport.set("proxy_socks_module", { SocksClient });
  }
  return transport;
};

/** `Name <address>` or a bare address, as SMTP_FROM has it. */
const senderOf = (from: string | undefined) => {
  const value = from?.trim() ?? "";
  const named = /^(?<name>.*?)\s*<(?<address>[^<>\s]+@[^<>\s]+)>$/u.exec(
    value
  )?.groups;
  if (named) {
    return {
      address: named.address,
      name: named.name?.replaceAll(/^"|"$/gu, "").trim() || null,
    };
  }
  return { address: value.includes("@") ? value : null, name: null };
};

/** The known service whose server this is; any other — «Другая». */
const presetOf = (server: MailServer): MailPresetId =>
  (Object.entries(MAIL_PRESETS).find(
    ([, p]) => p.smtp.host === server.host && p.smtp.port === server.port
  )?.[0] as MailPresetId | undefined) ?? "custom";

/**
 * An install's SMTP_URL (`smtp://user:pass@host:587`, `smtps://…`) and SMTP_FROM, as the mail settings keep them.
 * Without a port — 465 for smtps, 587 otherwise, as nodemailer takes them; 465 is SSL, 587 STARTTLS, any other
 * port goes as it is, a relay inside the network.
 */
export const parseSmtpEnv = (url: string, from?: string) => {
  const parsed = new URL(url);
  if (parsed.protocol !== "smtp:" && parsed.protocol !== "smtps:") {
    throw new Error(`SMTP_URL must start with smtp:// or smtps://: ${url}`);
  }
  const ssl = parsed.protocol === "smtps:";
  const port = Number(parsed.port) || (ssl ? 465 : 587);
  let security: MailServer["security"] = "none";
  if (ssl || port === 465) {
    security = "ssl";
  } else if (port === 587) {
    security = "starttls";
  }
  const smtp = { host: parsed.hostname, port, security };
  const username = decodeURIComponent(parsed.username) || null;
  const sender = senderOf(from);
  const address =
    sender.address ??
    (username?.includes("@") ? username : `no-reply@${parsed.hostname}`);
  return {
    address: address.toLowerCase(),
    name: sender.name ?? "Metobe",
    password: decodeURIComponent(parsed.password) || null,
    preset: presetOf(smtp),
    smtp,
    username,
  };
};
