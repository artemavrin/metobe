import "server-only";
import { createHmac } from "node:crypto";

import { getEnv } from "./env";
import {
  boxesForMemory,
  listMailboxes,
  mailEnvelopes,
  markMemoryChecked,
} from "./mailboxes";
import type { Mailbox } from "./mailboxes";
import {
  MAIL_OFFER_KEY,
  listDismissals,
  listEntities,
  saveMailWaits,
} from "./memory";
import { cardAddresses, waitingLetters } from "./memory-mail";
import { isMemoryOnFor } from "./memory-write";

// The look for letters with no answer (Г3.1): about once an hour, each box whose owner turned on «Замечать письма без
// ответа» is read for envelopes (no letter's text) and what waits is kept for «Не упустить». A service job of the
// worker, not a task of «Задачи»: there is nothing in it to set up or break (MEMORY-PLAN §16.3).

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;
/** Envelopes read back this far: who has written to the box, and the answers. */
const READ_DAYS = 60;
/** Letters sent this far back may wait; older ones are let go. */
const SENT_DAYS = 30;

/** A letter's `Message-ID` under the installation's secret: a row's key that names no letter. */
export const letterKey = (messageId: string) =>
  createHmac("sha256", getEnv().BETTER_AUTH_SECRET)
    .update(`mail:${messageId}`)
    .digest("base64url")
    .slice(0, 32);

/** One box: the cards with an address, the envelopes, and what waits — kept, the rest answered. */
const checkBox = async (box: Mailbox, now: Date) => {
  if (!(await isMemoryOnFor(box.userId))) {
    return;
  }
  const entities = await listEntities(box.userId);
  if (!entities.some((e) => e.kind === "person" || e.email)) {
    await saveMailWaits(box.userId, box.id, [], now);
    return;
  }
  const { envelopes, sentFolder } = await mailEnvelopes(
    box.userId,
    box.id,
    new Date(now.getTime() - READ_DAYS * DAY_MS)
  );
  const cards = cardAddresses(entities, envelopes);
  const waits = waitingLetters({
    address: box.address,
    cards,
    envelopes,
    sentFolder,
    since: new Date(now.getTime() - SENT_DAYS * DAY_MS),
  });
  await saveMailWaits(
    box.userId,
    box.id,
    waits.map((w) => ({
      body: {
        messageId: w.messageId,
        references: w.references,
        subject: w.subject,
        to: w.to,
      },
      entityId: w.entityId,
      key: letterKey(w.messageId),
      sentAt: w.sentAt,
    })),
    now
  );
};

/**
 * Looks at the boxes due for it, one at a time; a box that fails is looked at again in an hour, like one that did
 * not. Answers how many were looked at.
 */
export const checkMailWaits = async (now = new Date()) => {
  const boxes = await boxesForMemory(new Date(now.getTime() - HOUR_MS));
  for (const box of boxes) {
    let failed: string | null = null;
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one box at a time: each holds an IMAP connection
      await checkBox(box, now);
    } catch (error) {
      failed = error instanceof Error ? error.message : String(error);
      console.error(
        "memory: could not look for letters with no answer",
        failed
      );
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- noted after each
    await markMemoryChecked(box.id, now, failed?.slice(0, 500) ?? null);
  }
  return boxes.length;
};

/**
 * «Замечать письма без ответа?» in «Не упустить» (P24 «Предложение»): offered while the person has a box, the memory
 * reads none of them, and they did not say «Не надо».
 */
export const offersMailReading = async (userId: string) => {
  const [boxes, dismissed] = await Promise.all([
    listMailboxes(userId),
    listDismissals(userId),
  ]);
  return (
    boxes.length > 0 &&
    !boxes.some((b) => b.memoryReads) &&
    !dismissed.has(`${MAIL_OFFER_KEY}:${userId}`)
  );
};
