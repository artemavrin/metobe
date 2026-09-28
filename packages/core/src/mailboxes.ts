import "server-only";
import type { ToolApproval as ApprovalPolicy } from "@metobe/contracts/catalog";
import type {
  EmailReadInput,
  EmailReadOutput,
  EmailSearchInput,
  EmailSearchOutput,
  EmailSendInput,
  EmailSendOutput,
  MailboxInput,
  MailServer,
  MailTool,
} from "@metobe/contracts/email";
import { mailboxes } from "@metobe/db/schema/mail";
import type { Mailbox } from "@metobe/db/schema/mail";
import { and, asc, eq } from "drizzle-orm";
import { ImapFlow } from "imapflow";
import { parseHTML } from "linkedom";
import { simpleParser } from "mailparser";
import { Marked } from "marked";
import { createTransport } from "nodemailer";
import { SocksClient } from "socks";

import { getDb } from "./db";
import { mailEndpoint } from "./net";
import { removeSecrets, setSecret, withSecret } from "./secrets";

// A user's own mailboxes (ARCH §17.7): SMTP to send, IMAP to read. Each is checked before it is saved — the
// password is only kept once both servers took it. Every connection goes to the address we resolved and checked
// (never a private one), through a proxy when the routes say so, with TLS checked by the server's name.

export type { Mailbox } from "@metobe/db/schema/mail";

const TIMEOUT_MS = 15_000;
/** A letter read into a small model's context: about 2.5k tokens of text, as a web page. */
const MAX_CHARS = 8000;

const ownerOf = (id: string) => ({ id, type: "mailbox" as const });

/** Why a server turned us away, as the form and the model say it. */
export type MailProblem = "auth" | "unreachable" | "tls" | "private";

export class MailError extends Error {
  readonly server: "smtp" | "imap";
  readonly problem: MailProblem;

  constructor(server: "smtp" | "imap", problem: MailProblem, detail: string) {
    super(`${server.toUpperCase()}: ${detail}`);
    this.name = "MailError";
    this.server = server;
    this.problem = problem;
  }
}

const problemOf = (error: unknown): MailProblem => {
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

const fail = (server: "smtp" | "imap", error: unknown): never => {
  throw new MailError(
    server,
    problemOf(error),
    (error as Error).message ?? String(error)
  );
};

export interface Credentials {
  username: string;
  password: string;
}

const smtpOf = async (server: MailServer, auth: Credentials) => {
  const at = await mailEndpoint(server.host);
  const transport = createTransport({
    auth: { pass: auth.password, user: auth.username },
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

const imapOf = async (server: MailServer, auth: Credentials) => {
  const at = await mailEndpoint(server.host);
  return new ImapFlow({
    auth: { pass: auth.password, user: auth.username },
    connectionTimeout: TIMEOUT_MS,
    disableAutoIdle: true,
    doSTARTTLS: server.security === "none" ? false : undefined,
    greetingTimeout: TIMEOUT_MS,
    host: at.host,
    logger: false,
    port: server.port,
    ...(at.proxy ? { proxy: at.proxy } : {}),
    secure: server.security === "ssl",
    servername: at.servername,
    socketTimeout: TIMEOUT_MS,
  });
};

/** Both servers take the login: SMTP's own check, and an IMAP sign-in and out. Throws a MailError otherwise. */
export const verifyMailServers = async (
  smtp: MailServer,
  imap: MailServer,
  auth: Credentials
) => {
  try {
    const transport = await smtpOf(smtp, auth);
    await transport.verify();
    transport.close();
  } catch (error) {
    fail("smtp", error);
  }
  try {
    const client = await imapOf(imap, auth);
    await client.connect();
    await client.logout();
  } catch (error) {
    fail("imap", error);
  }
};

// A handful of checks per user in ten minutes: the form must not become a port scanner (ARCH §17.1). In memory —
// one app process (D2).
const CHECKS_PER_WINDOW = 10;
const WINDOW_MS = 10 * 60_000;
const checks = new Map<string, number[]>();

/** False when the user checked too many boxes just now. */
const mayCheck = (userId: string) => {
  const now = Date.now();
  const recent = (checks.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= CHECKS_PER_WINDOW) {
    checks.set(userId, recent);
    return false;
  }
  checks.set(userId, [...recent, now]);
  return true;
};

export type SaveResult =
  | { ok: true; id: string }
  | { ok: false; server?: "smtp" | "imap"; problem: MailProblem | "busy" };

/**
 * Adds a box, or replaces one with the same address: checked first, then saved — the password in `secrets`, the
 * rest in the row. Nothing is kept that the servers did not take.
 */
export const saveMailbox = async (
  userId: string,
  input: MailboxInput
): Promise<SaveResult> => {
  if (!mayCheck(userId)) {
    return { ok: false, problem: "busy" };
  }
  const auth = { password: input.password, username: input.username };
  try {
    await verifyMailServers(input.smtp, input.imap, auth);
  } catch (error) {
    if (error instanceof MailError) {
      return { ok: false, problem: error.problem, server: error.server };
    }
    throw error;
  }
  const { db } = getDb();
  const values = {
    address: input.address.toLowerCase(),
    imap: input.imap,
    lastError: null,
    preset: input.preset,
    smtp: input.smtp,
    status: "active" as const,
    userId,
    username: input.username,
  };
  const [row] = await db
    .insert(mailboxes)
    .values(values)
    .onConflictDoUpdate({
      set: values,
      target: [mailboxes.userId, mailboxes.address],
    })
    .returning({ id: mailboxes.id });
  if (!row) {
    throw new Error("the mailbox was not saved");
  }
  await setSecret(ownerOf(row.id), "password", input.password);
  return { id: row.id, ok: true };
};

/** The user's boxes, by address — what is safe to show. */
export const listMailboxes = (userId: string) =>
  getDb()
    .db.select()
    .from(mailboxes)
    .where(eq(mailboxes.userId, userId))
    .orderBy(asc(mailboxes.address));

/** «Ask first?» for one tool of a box of the user's; false when there is no such box. */
export const setMailboxPolicy = async (
  userId: string,
  id: string,
  tool: MailTool,
  policy: ApprovalPolicy
) => {
  const { db } = getDb();
  const [box] = await db
    .select({ toolPolicy: mailboxes.toolPolicy })
    .from(mailboxes)
    .where(and(eq(mailboxes.id, id), eq(mailboxes.userId, userId)));
  if (!box) {
    return false;
  }
  await db
    .update(mailboxes)
    .set({ toolPolicy: { ...box.toolPolicy, [tool]: policy } })
    .where(eq(mailboxes.id, id));
  return true;
};

/** Removes a box of the user's and its password; false when there was none. */
export const removeMailbox = async (userId: string, id: string) => {
  const { db } = getDb();
  const [row] = await db
    .delete(mailboxes)
    .where(and(eq(mailboxes.id, id), eq(mailboxes.userId, userId)))
    .returning({ id: mailboxes.id });
  if (!row) {
    return false;
  }
  await removeSecrets(ownerOf(row.id));
  return true;
};

/** The box a tool asked for — by address, or the only one. A plain error the model can act on otherwise. */
const pick = async (userId: string, address?: string) => {
  const boxes = await listMailboxes(userId);
  if (boxes.length === 0) {
    throw new Error(
      "the user has no mailbox connected — ask them to connect one"
    );
  }
  if (address) {
    const box = boxes.find((b) => b.address === address.toLowerCase());
    if (!box) {
      throw new Error(
        `no mailbox ${address}; the user's are: ${boxes.map((b) => b.address).join(", ")}`
      );
    }
    return box;
  }
  if (boxes.length > 1) {
    throw new Error(
      `the user has several mailboxes — say which: ${boxes.map((b) => b.address).join(", ")}`
    );
  }
  return boxes[0] as Mailbox;
};

/** Runs `fn` with the box's login; marks the box used, or broken when the server stopped taking the password. */
const withBox = async <T>(
  box: Mailbox,
  server: "smtp" | "imap",
  fn: (auth: Credentials) => Promise<T>
) => {
  const password = await withSecret(ownerOf(box.id), "password", (v) => v);
  if (password === null) {
    throw new Error(
      `the password of ${box.address} is missing — ask the user to connect it again`
    );
  }
  const { db } = getDb();
  try {
    const out = await fn({ password, username: box.username });
    await db
      .update(mailboxes)
      .set({ lastError: null, lastUsedAt: new Date(), status: "active" })
      .where(eq(mailboxes.id, box.id));
    return out;
  } catch (error) {
    const problem = problemOf(error);
    const message = `${server.toUpperCase()}: ${(error as Error).message}`;
    if (problem === "auth") {
      await db
        .update(mailboxes)
        .set({ lastError: message, status: "needs_reauth" })
        .where(eq(mailboxes.id, box.id));
      throw new Error(
        `${box.address} no longer takes its password — ask the user to connect it again`,
        { cause: error }
      );
    }
    throw new Error(`${box.address}: ${message}`, { cause: error });
  }
};

const escapeHtml = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

// The model writes Markdown; the letter goes as HTML made from it. Raw HTML in its words is shown as text — the
// model does not get to write markup into a letter sent in the user's name.
const markdown = new Marked({
  gfm: true,
  renderer: { html: ({ text }) => escapeHtml(text) },
});

/** A letter's Markdown as HTML, in plain type a mail client shows as it is. */
export const letterHtml = (text: string) =>
  `<div style="font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 15px; line-height: 1.5; color: #1a1a1a">${markdown.parse(text, { async: false })}</div>`;

/** Sends a letter from `from` through the SMTP server. */
export const sendVia = async (
  smtp: MailServer,
  auth: Credentials,
  from: string,
  input: EmailSendInput
): Promise<EmailSendOutput> => {
  const transport = await smtpOf(smtp, auth);
  try {
    // Both: HTML from the Markdown, and the words themselves for clients that show only text.
    const info = await transport.sendMail({
      cc: input.cc,
      from,
      html: letterHtml(input.text),
      subject: input.subject,
      text: input.text,
      to: input.to,
    });
    return { from, messageId: info.messageId, sent: true };
  } finally {
    transport.close();
  }
};

export const sendEmail = async (
  userId: string,
  input: EmailSendInput
): Promise<EmailSendOutput> => {
  const box = await pick(userId, input.mailbox);
  return withBox(box, "smtp", (auth) =>
    sendVia(box.smtp, auth, box.address, input)
  );
};

/** A signed-in IMAP client, logged out after `fn`. */
const withImap = async <T>(
  imap: MailServer,
  auth: Credentials,
  fn: (client: ImapFlow) => Promise<T>
) => {
  const client = await imapOf(imap, auth);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => null);
  }
};

const nameOf = (a?: { name?: string; address?: string }[]) =>
  (a ?? [])
    .map((x) =>
      x.name && x.address
        ? `${x.name} <${x.address}>`
        : (x.address ?? x.name ?? "")
    )
    .join(", ");

/** The newest letters that match, from the IMAP server. */
export const searchVia = (
  imap: MailServer,
  auth: Credentials,
  input: EmailSearchInput
): Promise<EmailSearchOutput> => {
  const folder = input.folder ?? "INBOX";
  const limit = input.limit ?? 10;
  return withImap(imap, auth, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const found = await client.search(
        {
          ...(input.from ? { from: input.from } : {}),
          ...(input.since ? { since: input.since } : {}),
          ...(input.text ? { text: input.text } : {}),
          ...(input.unread ? { seen: false } : {}),
        },
        { uid: true }
      );
      const uids = Array.isArray(found) ? found : [];
      const newest = uids.slice(-limit);
      const letters: EmailSearchOutput["letters"] = [];
      if (newest.length > 0) {
        for await (const m of client.fetch(
          newest.join(","),
          { envelope: true, flags: true, internalDate: true, uid: true },
          { uid: true }
        )) {
          letters.push({
            ...(m.envelope?.date
              ? { date: new Date(m.envelope.date).toISOString() }
              : {}),
            folder,
            from: nameOf(m.envelope?.from),
            subject: m.envelope?.subject ?? "",
            uid: m.uid,
            unread: !m.flags?.has("\\Seen"),
          });
        }
      }
      // Newest first, as a mail client lists them.
      letters.sort((a, b) => b.uid - a.uid);
      return { letters, total: uids.length };
    } finally {
      lock.release();
    }
  });
};

/** A letter's text: its plain part, else its HTML as text. */
const textOf = (plain: string | undefined, html: string | false) => {
  if (plain?.trim()) {
    return plain.trim();
  }
  if (!html) {
    return "";
  }
  const { document } = parseHTML(html);
  for (const el of document.querySelectorAll("script, style")) {
    el.remove();
  }
  return (document.body?.textContent ?? document.textContent ?? "")
    .replaceAll(/\s+/gu, " ")
    .trim();
};

/** One letter, parsed: its addresses, its text (cut for the model), its attachments' names. */
export const readVia = (
  imap: MailServer,
  auth: Credentials,
  input: EmailReadInput
): Promise<EmailReadOutput> => {
  const folder = input.folder ?? "INBOX";
  return withImap(imap, auth, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const m = await client.fetchOne(
        String(input.uid),
        { source: true },
        { uid: true }
      );
      if (!m || !m.source) {
        throw new Error(`no letter ${input.uid} in ${folder}`);
      }
      const letter = await simpleParser(m.source);
      const text = textOf(letter.text, letter.html);
      const addresses = (v: typeof letter.to) => {
        if (!v) {
          return "";
        }
        return (Array.isArray(v) ? v : [v]).map((a) => a.text).join(", ");
      };
      return {
        attachments: letter.attachments.map((a) => ({
          name: a.filename ?? "без имени",
          size: a.size,
        })),
        ...(letter.cc ? { cc: addresses(letter.cc) } : {}),
        ...(letter.date ? { date: letter.date.toISOString() } : {}),
        from: letter.from?.text ?? "",
        subject: letter.subject ?? "",
        text: text.slice(0, MAX_CHARS),
        to: addresses(letter.to),
        truncated: text.length > MAX_CHARS,
      };
    } finally {
      lock.release();
    }
  });
};

export const searchEmail = async (userId: string, input: EmailSearchInput) => {
  const box = await pick(userId, input.mailbox);
  return withBox(box, "imap", (auth) => searchVia(box.imap, auth, input));
};

export const readEmail = async (userId: string, input: EmailReadInput) => {
  const box = await pick(userId, input.mailbox);
  return withBox(box, "imap", (auth) => readVia(box.imap, auth, input));
};
