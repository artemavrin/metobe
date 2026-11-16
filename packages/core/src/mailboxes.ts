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
import { and, asc, eq, isNull, lt, or } from "drizzle-orm";
import { ImapFlow } from "imapflow";
import { parseHTML } from "linkedom";
import { simpleParser } from "mailparser";
import { Marked } from "marked";

import { getDb } from "./db";
import { mailEndpoint } from "./net";
import { getPersonalPolicy } from "./personal";
import { removeSecrets, setSecret, withSecret } from "./secrets";
import { TIMEOUT_MS, problemOf, smtpTransport } from "./smtp";
import type { Credentials, MailProblem } from "./smtp";

// A user's own mailboxes (ARCH §17.7): SMTP to send, IMAP to read. Each is checked before it is saved — the
// password is only kept once both servers took it. Every connection goes to the address we resolved and checked
// (never a private one), through a proxy when the routes say so, with TLS checked by the server's name.

export type { Mailbox } from "@metobe/db/schema/mail";

/** A letter read into a small model's context: about 2.5k tokens of text, as a web page. */
const MAX_CHARS = 8000;

const ownerOf = (id: string) => ({ id, type: "mailbox" as const });

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

const fail = (server: "smtp" | "imap", error: unknown): never => {
  throw new MailError(
    server,
    problemOf(error),
    (error as Error).message ?? String(error)
  );
};

/** Where a server of a box is, as the admin's «Доступ» allows; none at all while own connections are off. */
const endpointOf = async (host: string) => {
  const { mode } = await getPersonalPolicy();
  // Turned off: the boxes stay, and nothing goes to their servers.
  if (mode === "off") {
    throw new Error(
      "the administrator turned people's own connections off — tell the user, do not try another way"
    );
  }
  return mailEndpoint(host, mode === "on");
};

const smtpOf = async (server: MailServer, auth: Credentials) =>
  smtpTransport(server, auth, await endpointOf(server.host));

const imapOf = async (server: MailServer, auth: Credentials) => {
  const at = await endpointOf(server.host);
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
  | {
      ok: false;
      server?: "smtp" | "imap";
      problem: MailProblem | "busy" | "off";
    };

/**
 * Adds a box, or replaces one with the same address: checked first, then saved — the password in `secrets`, the
 * rest in the row. Nothing is kept that the servers did not take.
 */
export const saveMailbox = async (
  userId: string,
  input: MailboxInput
): Promise<SaveResult> => {
  const { mode } = await getPersonalPolicy();
  if (mode === "off") {
    return { ok: false, problem: "off" };
  }
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

/** «Замечать письма без ответа» on a box of the user's (Г3.1); false when there is no such box. */
export const setMailboxMemory = async (
  userId: string,
  id: string,
  on: boolean
) => {
  const rows = await getDb()
    .db.update(mailboxes)
    .set({ memoryReads: on })
    .where(and(eq(mailboxes.id, id), eq(mailboxes.userId, userId)))
    .returning({ id: mailboxes.id });
  return rows.length > 0;
};

/** The boxes the memory reads whose last look was before `before` (or never), the longest ago first. */
export const boxesForMemory = (before: Date) =>
  getDb()
    .db.select()
    .from(mailboxes)
    .where(
      and(
        eq(mailboxes.memoryReads, true),
        eq(mailboxes.status, "active"),
        or(
          isNull(mailboxes.memoryCheckedAt),
          lt(mailboxes.memoryCheckedAt, before)
        )
      )
    )
    .orderBy(asc(mailboxes.memoryCheckedAt));

/** Notes the memory's look at a box, done or failed (`error`): the next is an hour on either way. */
export const markMemoryChecked = (
  id: string,
  at: Date,
  error: string | null = null
) =>
  getDb()
    .db.update(mailboxes)
    .set({ memoryCheckedAt: at, memoryError: error })
    .where(eq(mailboxes.id, id));

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

/**
 * A reply in a thread from a given box (Г3.1 «Напомнить»): `In-Reply-To` and `References` tie it to the letter, so
 * the other side's mail shows it under the first one.
 */
export const replyEmail = (
  box: Mailbox,
  input: {
    to: string;
    subject: string;
    text: string;
    inReplyTo: string;
    references: string[];
  }
) =>
  withBox(box, "smtp", async (auth) => {
    const transport = await smtpOf(box.smtp, auth);
    try {
      const info = await transport.sendMail({
        from: box.address,
        html: letterHtml(input.text),
        inReplyTo: input.inReplyTo,
        references: input.references,
        subject: input.subject,
        text: input.text,
        to: input.to,
      });
      return { from: box.address, messageId: info.messageId, sent: true };
    } finally {
      transport.close();
    }
  });

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

// ── Envelopes for the memory (Г3.1): who wrote to whom, in which thread — never a letter's body ─────────────────────

/** A letter's envelope and the headers that tie it into a thread; no body is read. */
export interface MailEnvelope {
  folder: string;
  uid: number;
  messageId: string | null;
  inReplyTo: string | null;
  /** `References`: the thread's earlier letters, oldest first. */
  references: string[];
  from: string[];
  to: string[];
  cc: string[];
  subject: string;
  date: string | null;
  /** The names the letter gives its people, by address: «Ольга Ли» for olga@… — from the envelope, as written. */
  names: Record<string, string>;
  /** An autoreply, a list or bulk mail (`Auto-Submitted`, `List-Id`, `Precedence`): nobody's answer. */
  auto: boolean;
}

/**
 * The folders that hold no answers: drafts, spam, and Gmail's starred view (copies). The bin and the archive do — an
 * answer read and deleted is still an answer (S16: a box kept 744 letters a year in its bin). Gmail's «All Mail» holds
 * the archived ones; its copies of the inbox are the same letters, told apart by `Message-ID`.
 */
const NOT_ANSWERS = new Set(["\\Drafts", "\\Junk", "\\Flagged"]);
const SENT_NAME =
  /^(?:sent|sent items|sent messages|sent mail|отправленные)$/iu;

const ids = (value: string | undefined) =>
  (value ?? "").match(/<[^<>\s]+>/gu) ?? [];

const addressesOf = (list?: { address?: string }[]) =>
  (list ?? []).flatMap((a) => (a.address ? [a.address.toLowerCase()] : []));

const namesOf = (
  ...lists: ({ address?: string; name?: string }[] | undefined)[]
) =>
  Object.fromEntries(
    lists.flatMap((list) =>
      (list ?? []).flatMap((a) =>
        a.address && a.name?.trim()
          ? [[a.address.toLowerCase(), a.name.trim()] as const]
          : []
      )
    )
  );

/** One header's value from a fetched raw header block (unfolded). */
const headerOf = (raw: string, name: string) => {
  const unfolded = raw.replaceAll(/\r?\n[ \t]+/gu, " ");
  const line = unfolded
    .split(/\r?\n/u)
    .find((l) => l.toLowerCase().startsWith(`${name.toLowerCase()}:`));
  return line ? line.slice(name.length + 1).trim() : undefined;
};

const THREAD_HEADERS = [
  "message-id",
  "in-reply-to",
  "references",
  "auto-submitted",
  "list-id",
  "precedence",
];

/** What a fetch of the envelope and the thread's headers gives for a letter. */
interface Fetched {
  uid: number;
  envelope?: {
    cc?: { address?: string; name?: string }[];
    date?: Date | string;
    from?: { address?: string; name?: string }[];
    inReplyTo?: string;
    messageId?: string;
    subject?: string;
    to?: { address?: string; name?: string }[];
  };
  headers?: Buffer;
}

/** Mail that answers nobody: an autoreply, a mailing list, bulk. */
const isAutomatic = (raw: string) => {
  const auto = headerOf(raw, "auto-submitted")?.toLowerCase();
  const precedence = headerOf(raw, "precedence")?.toLowerCase();
  return (
    (auto !== undefined && auto !== "no") ||
    headerOf(raw, "list-id") !== undefined ||
    precedence === "bulk" ||
    precedence === "list" ||
    precedence === "junk"
  );
};

const envelopeOf = (m: Fetched, folder: string): MailEnvelope => {
  const raw = m.headers?.toString("utf-8") ?? "";
  const e = m.envelope;
  return {
    auto: isAutomatic(raw),
    cc: addressesOf(e?.cc),
    date: e?.date ? new Date(e.date).toISOString() : null,
    folder,
    from: addressesOf(e?.from),
    inReplyTo: ids(e?.inReplyTo)[0] ?? null,
    messageId: e?.messageId ?? null,
    names: namesOf(e?.from, e?.to, e?.cc),
    references: ids(headerOf(raw, "references")),
    subject: e?.subject ?? "",
    to: addressesOf(e?.to),
    uid: m.uid,
  };
};

/** One folder's envelopes since a day. */
const folderEnvelopes = async (
  client: ImapFlow,
  folder: string,
  since: Date
) => {
  const lock = await client.getMailboxLock(folder);
  try {
    const found = await client.search({ since }, { uid: true });
    const uids = Array.isArray(found) ? found : [];
    const out: MailEnvelope[] = [];
    if (uids.length === 0) {
      return out;
    }
    for await (const m of client.fetch(
      uids.join(","),
      { envelope: true, headers: THREAD_HEADERS, uid: true },
      { uid: true }
    )) {
      out.push(envelopeOf(m as Fetched, folder));
    }
    return out;
  } finally {
    lock.release();
  }
};

/**
 * The envelopes of the letters since a day, in every folder but drafts and spam (S16): the sent folder — the one the
 * server marks `\Sent`, else the one named so; none — no sent — and every folder answers may lie in.
 */
export const envelopesVia = (
  imap: MailServer,
  auth: Credentials,
  since: Date
): Promise<{ sentFolder: string | null; envelopes: MailEnvelope[] }> =>
  withImap(imap, auth, async (client) => {
    const folders = await client.list();
    const sent =
      folders.find((f) => f.specialUse === "\\Sent") ??
      folders.find((f) => SENT_NAME.test(f.name));
    const read = folders.filter(
      (f) =>
        !(f.specialUse && NOT_ANSWERS.has(f.specialUse)) &&
        !f.flags.has("\\Noselect")
    );
    const envelopes: MailEnvelope[] = [];
    for (const folder of read) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one folder at a time: IMAP selects one
      envelopes.push(...(await folderEnvelopes(client, folder.path, since)));
    }
    return { envelopes, sentFolder: sent?.path ?? null };
  });

/** A box's envelopes since a day (`envelopesVia`), with its login. */
export const mailEnvelopes = async (
  userId: string,
  mailboxId: string,
  since: Date
) => {
  const boxes = await listMailboxes(userId);
  const box = boxes.find((b) => b.id === mailboxId);
  if (!box) {
    throw new Error("no such mailbox");
  }
  return withBox(box, "imap", (auth) => envelopesVia(box.imap, auth, since));
};
