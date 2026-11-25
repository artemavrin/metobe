import "server-only";
import { policyOf } from "@metobe/contracts/email";
import type { MemoryReminderDraft } from "@metobe/contracts/memory";
import type { Locale } from "@metobe/i18n/config";
import { getTranslator } from "@metobe/i18n/translator";
import { generateText, Output } from "ai";

import { getLanguageModel } from "./ai";
import { recordRun } from "./chat-run";
import { listMailboxes, replyEmail, sendEmail } from "./mailboxes";
import {
  listEntities,
  listMailWaits,
  listRecords,
  markReminded,
  recordContact,
  touchMailWait,
} from "./memory";
import { localMidnight } from "./memory-extract";
import {
  LETTER_INSTRUCTIONS,
  letterPrompt,
  letterSchema,
  templateLetter,
} from "./memory-letter";
import type { LetterFacts, LetterTone } from "./memory-letter";
import { recordSource } from "./memory-page";
import { sidesOf } from "./memory-today";
import { getSlotModel } from "./model-slots";
import { getPersonalPolicyOf } from "./personal";

// «Напомнить» in «Не упустить» (Г2.4, P23 «Окно»): a letter to the one who owes the person, written by the model of
// the slot «Память» (a person's memory goes to no other model, D39) or, without one, by a template; sent from the
// person's own box when they press «Отправить» — that press is the «ask first?» of the box. After it the card gets an
// event, and the row leaves «Не упустить» while the one who owes has the wait to answer; with no change by then it is
// back as «напомнили N дн. назад» (`memory-today`).

const WRITE_TIMEOUT_MS = 20_000;

/** The promise the person is owed, open, with the card of who owes it; null — not one. */
const owedOf = async (ownerId: string, recordId: string) => {
  const [[record], entities] = await Promise.all([
    listRecords(ownerId, { ids: [recordId], kinds: ["commitment"] }),
    listEntities(ownerId),
  ]);
  if (!record || record.status !== "open") {
    return null;
  }
  const { side, who } = sidesOf(
    record,
    new Map(entities.map((e) => [e.id, e]))
  );
  return side === "theirs" && who ? { record, who } : null;
};

/** The boxes a letter can go from: the person's own mail is on and the box has not turned sending off. */
const sendingBoxes = async (ownerId: string) => {
  const personal = await getPersonalPolicyOf(ownerId);
  if (personal.mode === "off") {
    return [];
  }
  const boxes = await listMailboxes(ownerId);
  return boxes.filter(
    (b) => policyOf(b.toolPolicy, "email_send", personal.approvals) !== "deny"
  );
};

const dayOf = (at: Date, locale: Locale, timeZone: string) =>
  new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    timeZone,
  }).format(at);

/** The model's letter; null when the slot has no model or it fails — the template is used then. */
const modelLetter = async (
  ownerId: string,
  facts: LetterFacts,
  tone: LetterTone,
  locale: Locale
) => {
  const model = await getSlotModel("memory");
  if (!model) {
    return null;
  }
  const started = Date.now();
  try {
    const result = await generateText({
      abortSignal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
      instructions: LETTER_INSTRUCTIONS,
      maxRetries: 1,
      model: await getLanguageModel(model.sourceId, model.modelId),
      output: Output.object({ schema: letterSchema }),
      prompt: letterPrompt(facts, tone, locale),
      providerOptions:
        model.kind === "gateway"
          ? { gateway: { zeroDataRetention: true } }
          : undefined,
    });
    await recordRun({
      chatId: null,
      latencyMs: Date.now() - started,
      model,
      providerMetadata: result.providerMetadata,
      purpose: "memory",
      status: "ok",
      usage: result.totalUsage,
      userId: ownerId,
    });
    const { subject, text } = result.output;
    return subject.trim() && text.trim() ? { subject, text } : null;
  } catch (error) {
    await recordRun({
      chatId: null,
      latencyMs: null,
      model,
      purpose: "memory",
      status: "error",
      userId: ownerId,
    }).catch(() => null);
    console.error("memory: could not write a reminder letter", error);
    return null;
  }
};

/**
 * The letter for the window: who it goes to (the card's address, if it has one), the subject and words, who wrote
 * them, the boxes it can go from, and where and when it was promised — for the person, not for the letter.
 */
export const reminderDraft = async (
  ownerId: string,
  recordId: string,
  {
    locale,
    timeZone,
    tone,
  }: { locale: Locale; timeZone: string; tone: LetterTone }
): Promise<MemoryReminderDraft | null> => {
  const owed = await owedOf(ownerId, recordId);
  if (!owed) {
    return null;
  }
  const { record, who } = owed;
  const now = new Date();
  const facts: LetterFacts = {
    due: record.dueAt ? dayOf(record.dueAt, locale, timeZone) : null,
    given: record.givenAt ? dayOf(record.givenAt, locale, timeZone) : null,
    late: record.dueAt !== null && record.dueAt.getTime() < now.getTime(),
    name: who.name,
    person: who.kind === "person",
    text: record.text,
  };
  const [written, boxes, source, t] = await Promise.all([
    modelLetter(ownerId, facts, tone, locale),
    sendingBoxes(ownerId),
    recordSource(ownerId, recordId),
    getTranslator(locale),
  ]);
  const letter =
    written ??
    templateLetter(facts, {
      body: (v) => t("memory.letter.body", v),
      hello: (v) => t("memory.letter.hello", v),
      helloAll: () => t("memory.letter.helloAll"),
      subject: (v) => t("memory.letter.subject", v),
      thanks: () => t("memory.letter.thanks"),
    });
  return {
    boxes: boxes.map((b) => b.address),
    by: written ? "model" : "template",
    chat: source?.chat ?? null,
    due: facts.due,
    given: facts.given,
    subject: letter.subject,
    text: letter.text,
    to: { email: who.email ?? null, id: who.id, name: who.name },
  };
};

/**
 * Sends the letter from the person's box (the one named, or the only one), then notes it on the card and marks the
 * promise reminded. A box with sending turned off is refused, as the chat refuses it.
 */
export const sendReminder = async (
  ownerId: string,
  recordId: string,
  input: { to: string; subject: string; text: string; mailbox?: string },
  { locale, timeZone }: { locale: Locale; timeZone: string }
) => {
  const owed = await owedOf(ownerId, recordId);
  if (!owed) {
    return null;
  }
  const boxes = await sendingBoxes(ownerId);
  const box = input.mailbox
    ? boxes.find((b) => b.address === input.mailbox?.toLowerCase())
    : boxes[0];
  if (!box || (!input.mailbox && boxes.length > 1)) {
    throw new Error("no mailbox to send from");
  }
  await sendEmail(ownerId, {
    mailbox: box.address,
    subject: input.subject,
    text: input.text,
    to: [input.to],
  });
  const t = await getTranslator(locale);
  const today = localMidnight(
    new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date()),
    timeZone
  );
  if (today) {
    await recordContact(
      ownerId,
      owed.who.id,
      today,
      t("memory.letter.event", { text: owed.record.text })
    );
  }
  await markReminded(ownerId, recordId);
  return { from: box.address, sent: true as const };
};

// ── A letter with no answer (Г3.1): «Напомнить» is a reply in its thread, from the box it went from ─────────────────

/** The wait, its card, and its box — while it can be sent from; null — no such wait, or its box no longer sends. */
const waitOf = async (ownerId: string, waitId: string) => {
  const [[wait], entities, boxes] = await Promise.all([
    listMailWaits(ownerId, waitId),
    listEntities(ownerId),
    sendingBoxes(ownerId),
  ]);
  const who = entities.find((e) => e.id === wait?.entityId);
  if (!(wait && who)) {
    return null;
  }
  return { box: boxes.find((b) => b.id === wait.mailboxId) ?? null, wait, who };
};

/** «Re: Договор» stays as it is; «Договор» becomes «Re: Договор». */
const replySubject = (subject: string) =>
  /^\s*re\s*:/iu.test(subject) ? subject : `Re: ${subject}`;

/** Days in the person's zone, for the words of the letter and the event. */
const today = (timeZone: string) =>
  localMidnight(
    new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date()),
    timeZone
  );

/**
 * The reply for the window: by the template — no model reads the person's mail (Г3.1). The box is the one the letter
 * went from; none — it no longer sends, and the letter is there to copy.
 */
export const mailReminderDraft = async (
  ownerId: string,
  waitId: string,
  { locale, timeZone }: { locale: Locale; timeZone: string }
): Promise<MemoryReminderDraft | null> => {
  const found = await waitOf(ownerId, waitId);
  if (!found) {
    return null;
  }
  const { box, wait, who } = found;
  const t = await getTranslator(locale);
  const sent = dayOf(wait.sentAt, locale, timeZone);
  return {
    boxes: box ? [box.address] : [],
    by: "template",
    chat: null,
    due: null,
    given: null,
    subject: replySubject(wait.subject),
    text: [
      who.kind === "person"
        ? t("memory.letter.hello", { name: who.name })
        : t("memory.letter.helloAll"),
      t("memory.letter.mailBody", { sent, subject: wait.subject }),
      t("memory.letter.thanks"),
    ].join("\n\n"),
    to: { email: wait.to, id: who.id, name: who.name },
  };
};

/** Sends the reply in the thread, notes it on the card, and the wait counts from now. */
export const sendMailReminder = async (
  ownerId: string,
  waitId: string,
  input: { subject: string; text: string },
  { locale, timeZone }: { locale: Locale; timeZone: string }
) => {
  const found = await waitOf(ownerId, waitId);
  if (!found) {
    return null;
  }
  const { box, wait, who } = found;
  if (!box) {
    throw new Error("no mailbox to send from");
  }
  await replyEmail(box, {
    inReplyTo: wait.messageId,
    references: wait.references,
    subject: input.subject,
    text: input.text,
    to: wait.to,
  });
  const t = await getTranslator(locale);
  const day = today(timeZone);
  if (day) {
    await recordContact(
      ownerId,
      who.id,
      day,
      t("memory.letter.mailEvent", { subject: wait.subject })
    );
  }
  await touchMailWait(ownerId, waitId, new Date());
  return { from: box.address, sent: true as const };
};
