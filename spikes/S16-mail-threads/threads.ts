// S16 (Г3.1, before code): can a sent letter be tied to its answer without reading a body? Read only, the owner's own
// boxes, no model, no spend. For each box: the envelopes of 30 days (`envelopesVia` — the sent folder and every folder
// answers may lie in), then for each letter the person sent — the answers found by the thread's headers
// (`In-Reply-To`/`References`) and by the address and subject alone, and where they disagree.
//
// Prints counts only. The pairs for checking by hand (subject, to, when, the answer and how it was found) go to a
// local file, PAIRS — it holds the owner's mail and stays on this machine.
//
//   cd apps/cli && npx tsx --conditions=react-server --env-file=../../.env ../../spikes/S16-mail-threads/threads.ts
//   DAYS=30 PAIRS=/path/pairs.tsv …

import { writeFileSync } from "node:fs";

import { getDb } from "../../packages/core/src/db.ts";
import { mailEnvelopes } from "../../packages/core/src/mailboxes.ts";
import type { MailEnvelope } from "../../packages/core/src/mailboxes.ts";

const DAYS = Number(process.env.DAYS ?? 30);
const PAIRS = process.env.PAIRS ?? "";

/** «Re: Fwd: [Склад] Договор» → «[склад] договор»: what stays of a subject through replies and forwards. */
export const baseSubject = (subject: string) => {
  let s = subject.trim().toLowerCase();
  for (;;) {
    const next = s.replace(/^(?:re|fw|fwd|aw|sv|ответ|отв|пересл|переслано|ha)\s*(?:\[\d+\])?\s*:\s*/iu, "");
    if (next === s) return s.replaceAll(/\s+/gu, " ");
    s = next;
  }
};

const isForward = (subject: string) => /^\s*(?:fw|fwd|пересл)/iu.test(subject);

interface Found {
  sent: MailEnvelope;
  byHeader: MailEnvelope[];
  bySubject: MailEnvelope[];
}

/** Each sent letter with the letters that answer it, found both ways. */
export const answersOf = (sent: MailEnvelope[], incoming: MailEnvelope[]): Found[] =>
  sent.map((s) => {
    const after = incoming.filter((m) => !s.date || !m.date || m.date > s.date);
    const byHeader = s.messageId
      ? after.filter((m) => m.inReplyTo === s.messageId || m.references.includes(s.messageId as string))
      : [];
    const people = new Set([...s.to, ...s.cc]);
    const subject = baseSubject(s.subject);
    const bySubject = subject
      ? after.filter((m) => m.from.some((a) => people.has(a)) && baseSubject(m.subject) === subject)
      : [];
    return { byHeader, bySubject, sent: s };
  });

const { sql } = getDb();
const boxes = await sql<{ id: string; user_id: string; preset: string }[]>`select id, user_id, preset from mailboxes`;
const since = new Date(Date.now() - DAYS * 86_400_000);
const pairs: string[] = ["box\tsent_at\tto\tsubject\tanswer_at\tanswer_from\tanswer_folder\thow"];
try {
  for (const box of boxes) {
    const started = Date.now();
    // oxlint-disable-next-line eslint/no-await-in-loop -- one box at a time
    const { envelopes, sentFolder } = await mailEnvelopes(box.user_id, box.id, since);
    const ms = Date.now() - started;
    const sent = envelopes.filter((e) => e.folder === sentFolder);
    const incoming = envelopes.filter((e) => e.folder !== sentFolder);
    const own = new Set(sent.flatMap((s) => s.from));
    // The same letter in two folders (Gmail's inbox and «All Mail»): once.
    const seen = new Set<string>();
    const others = incoming.filter((m) => {
      const key = m.messageId ?? `${m.folder}:${m.uid}`;
      if (m.from.some((a) => own.has(a)) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const found = answersOf(sent, others);
    const c = {
      both: 0, byHeaderOnly: 0, bySubjectOnly: 0, none: 0,
      answerFromOther: 0, answerAuto: 0, forwards: 0, manyTo: 0, noMessageId: 0, outsideInbox: 0,
      headerSubjectDisagree: 0,
      /** No answer, and the letter itself answers someone: the person wrote last in a thread. */
      noneIsReply: 0,
      /** No answer to a letter that starts a thread: what Г3.1 would show. */
      noneFresh: 0,
    };
    for (const f of found) {
      const h = f.byHeader.filter((m) => !m.auto);
      const sub = f.bySubject.filter((m) => !m.auto);
      if (f.byHeader.some((m) => m.auto)) c.answerAuto += 1;
      if (isForward(f.sent.subject)) c.forwards += 1;
      if (f.sent.to.length + f.sent.cc.length > 3) c.manyTo += 1;
      if (!f.sent.messageId) c.noMessageId += 1;
      const people = new Set([...f.sent.to, ...f.sent.cc]);
      if (h.some((m) => !m.from.some((a) => people.has(a)))) c.answerFromOther += 1;
      if (h.some((m) => m.folder.toUpperCase() !== "INBOX")) c.outsideInbox += 1;
      const hIds = new Set(h.map((m) => `${m.folder}:${m.uid}`));
      if (h.length > 0 && sub.length > 0) {
        c.both += 1;
        if (!sub.some((m) => hIds.has(`${m.folder}:${m.uid}`))) c.headerSubjectDisagree += 1;
      } else if (h.length > 0) c.byHeaderOnly += 1;
      else if (sub.length > 0) c.bySubjectOnly += 1;
      else {
        c.none += 1;
        if (f.sent.inReplyTo) c.noneIsReply += 1;
        else c.noneFresh += 1;
      }
      const first = (h[0] ?? sub[0]) as MailEnvelope | undefined;
      const how = h.length > 0 && sub.length > 0 ? "both" : h.length > 0 ? "header" : sub.length > 0 ? "subject" : "none";
      pairs.push([box.preset, f.sent.date ?? "", f.sent.to.join(","), f.sent.subject, first?.date ?? "", first?.from.join(",") ?? "", first?.folder ?? "", how].join("\t"));
    }
    console.log(JSON.stringify({
      box: box.preset,
      days: DAYS,
      folders: [...new Set(envelopes.map((e) => e.folder))].length,
      incoming: incoming.length,
      ms,
      sent: sent.length,
      sentFolder: sentFolder ? "found" : "none",
      ...c,
    }));
  }
  if (PAIRS) {
    writeFileSync(PAIRS, `${pairs.join("\n")}\n`);
    console.log(`pairs for checking by hand: ${PAIRS}`);
  }
} finally {
  await sql.end();
  process.exit(0);
}
