import type { MailEnvelope } from "./mailboxes";

// Letters with no answer (Г3.1, S16): which letters the person sent someone from the memory still wait for an answer —
// by envelopes and headers alone, no letter's text, no model. No database or IMAP here: the caller hands the box's
// envelopes and the cards' addresses, and says what today is.

/** «Re: Fwd: [Склад] Договор» → «[склад] договор»: what stays of a subject through replies and forwards. */
export const baseSubject = (subject: string) => {
  let s = subject.trim().toLowerCase();
  for (;;) {
    const next = s.replace(
      /^(?:re|fw|fwd|aw|sv|ответ|отв|пересл|переслано|ha)\s*(?:\[\d+\])?\s*:\s*/iu,
      ""
    );
    if (next === s) {
      return s.replaceAll(/\s+/gu, " ");
    }
    s = next;
  }
};

const isForward = (subject: string) => /^\s*(?:fw|fwd|пересл)/iu.test(subject);

/** More people than this on a letter — a mailing of the person's own, not a question to someone. */
const MAX_RECIPIENTS = 3;

/** A sent letter that waits: the card it waits on and that card's address, and the person's last letter in the thread. */
export interface MailWait {
  messageId: string;
  /** Its `References` and its own id: what a reply in the same thread refers to. */
  references: string[];
  subject: string;
  to: string;
  entityId: string;
  /** The person's last letter in the thread: the wait counts from it. */
  sentAt: Date;
}

const dateOf = (e: MailEnvelope) => (e.date ? new Date(e.date) : null);

/** The same letter in two folders (Gmail's inbox and «All Mail»): once. */
const once = (letters: MailEnvelope[]) => {
  const seen = new Set<string>();
  return letters.filter((m) => {
    const key = m.messageId ?? `${m.folder}:${m.uid}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const refersTo = (m: MailEnvelope, id: string) =>
  m.inReplyTo === id || m.references.includes(id);

/**
 * The letters that wait (the rule of S16): sent since `since`; they start a thread (no `In-Reply-To` — a reply is the
 * person writing last, nothing to wait on) and are not a forward; three people at most, and one of them a card's
 * address that has written to this box before (a box nobody answers to — S16's Mail.ru — shows nothing); no letter
 * from others (not an autoreply or a list) refers to it, and none came later from those it went to with the same
 * subject. The wait counts from the person's last letter in the thread.
 */
export const waitingLetters = ({
  address,
  cards,
  envelopes,
  sentFolder,
  since,
}: {
  /** The box's own address. */
  address: string;
  /** A card's address (lower case) → the card. */
  cards: ReadonlyMap<string, string>;
  envelopes: MailEnvelope[];
  sentFolder: string | null;
  since: Date;
}): MailWait[] => {
  const own = new Set([address.toLowerCase()]);
  const sent = once(
    envelopes.filter((e) =>
      sentFolder ? e.folder === sentFolder : e.from.some((a) => own.has(a))
    )
  );
  for (const s of sent) {
    for (const a of s.from) {
      own.add(a);
    }
  }
  const incoming = once(
    envelopes.filter((e) => !(e.auto || e.from.some((a) => own.has(a))))
  );
  const writers = new Set(incoming.flatMap((m) => m.from));
  return sent.flatMap((s): MailWait[] => {
    const at = dateOf(s);
    const id = s.messageId;
    if (!(id && at) || at < since || s.inReplyTo || isForward(s.subject)) {
      return [];
    }
    const people = [...new Set([...s.to, ...s.cc])].filter((a) => !own.has(a));
    const to = people.find((a) => cards.has(a) && writers.has(a));
    const entityId = to ? cards.get(to) : undefined;
    if (!(to && entityId) || people.length > MAX_RECIPIENTS) {
      return [];
    }
    const subject = baseSubject(s.subject);
    const answered = incoming.some((m) => {
      const when = dateOf(m);
      if (refersTo(m, id)) {
        return true;
      }
      return (
        Boolean(subject) &&
        when !== null &&
        when > at &&
        m.from.some((a) => people.includes(a)) &&
        baseSubject(m.subject) === subject
      );
    });
    if (answered) {
      return [];
    }
    let last = at;
    for (const m of sent) {
      const when = dateOf(m);
      if (when && when > last && refersTo(m, id)) {
        last = when;
      }
    }
    return [
      {
        entityId,
        messageId: id,
        references: [...s.references, id],
        sentAt: last,
        subject: s.subject,
        to,
      },
    ];
  });
};

const DAY_MS = 86_400_000;

/** Working days after `from`, up to and including `to` (`2026-11-14`): Saturdays and Sundays do not count. */
export const workingDaysBetween = (from: string, to: string) => {
  let count = 0;
  const end = Date.parse(`${to}T00:00:00Z`);
  for (
    let at = Date.parse(`${from}T00:00:00Z`) + DAY_MS;
    at <= end;
    at += DAY_MS
  ) {
    const weekday = new Date(at).getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      count += 1;
    }
  }
  return count;
};

const daysBetween = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS
  );

/** How long an answer is waited for when no rule says: five working days (D41, MEMORY-PLAN §16.2). */
export const DEFAULT_WAIT = { days: 5, workingDays: true };

export interface WaitRule {
  days: number;
  workingDays?: boolean | null;
}

/**
 * Days waited since the letter's day (`yyyy-mm-dd`), as the rule counts them — the card's wait rule, else the one for
 * anyone, else five working days; null while the wait is not over.
 */
export const waitedPast = (sentDay: string, today: string, rule?: WaitRule) => {
  const by = rule ?? DEFAULT_WAIT;
  const waited = by.workingDays
    ? workingDaysBetween(sentDay, today)
    : daysBetween(sentDay, today);
  return waited >= by.days ? waited : null;
};
