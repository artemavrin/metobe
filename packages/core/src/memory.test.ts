import { randomBytes } from "node:crypto";

import type { Db } from "@metobe/db/client";
import { runMigrations } from "@metobe/db/migrate";
import { user } from "@metobe/db/schema/auth";
import { chats, messages } from "@metobe/db/schema/chat";
import {
  memoryDrafts,
  memoryKeys,
  memoryRecords,
  memoryWrites,
} from "@metobe/db/schema/memory";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type * as MemoryModule from "./memory";
import type * as MemoryPageModule from "./memory-page";
import type * as MemoryReadModule from "./memory-read";
import type * as MemoryTodayModule from "./memory-today";

vi.mock("server-only", () => ({}));

// Needs a database of its own: MEMORY_TEST_DATABASE_URL=postgres://… pnpm --filter @metobe/core test memory.test
// (an empty one is fine — the migrations are applied). It creates its own users and removes them at the end, so any
// database works, and nothing else in it is touched.
const URL = process.env.MEMORY_TEST_DATABASE_URL;

/** Who owes whom, as a record's links. */
const owes = (debtor: string, creditor: string) => [
  { entityId: debtor, role: "debtor" as const },
  { entityId: creditor, role: "creditor" as const },
];

/** A minute past noon on 9 November 2026, UTC. */
const noon = (minute: number) => new Date(Date.UTC(2026, 10, 9, 12, minute));

describe.skipIf(!URL)("memory store (ARCH §19)", () => {
  let memory: typeof MemoryModule;
  /** A chat's message put in the queue, as the chat does it: the message's id is its key there (§19.9.5). */
  const chatWrite = (
    owner: string,
    message: {
      chatId: string;
      messageId: string;
      sentAt?: Date;
      timeZone?: string;
    }
  ) =>
    memory.createWrite(owner, {
      chatId: message.chatId,
      sentAt: message.sentAt,
      source: memory.CHAT_SOURCE,
      sourceKey: message.messageId,
      timeZone: message.timeZone,
    });
  let db: Db;
  const ana = `memory-test-${randomBytes(4).toString("hex")}`;
  const bob = `memory-test-${randomBytes(4).toString("hex")}`;
  /** The «Память» page's owner: a memory of its own, so the counts are exact. */
  const cleo = `memory-test-${randomBytes(4).toString("hex")}`;
  /** «На сегодня»: a memory of its own, so the list is exact. */
  const dana = `memory-test-${randomBytes(4).toString("hex")}`;
  /** Rules in «Не упустить»: a memory of its own. */
  const ella = `memory-test-${randomBytes(4).toString("hex")}`;
  /** The queue (§19.8.1): a queue of its own, so the order is exact. */
  const fern = `memory-test-${randomBytes(4).toString("hex")}`;
  /** Merging cards (§19.8.5): a memory of its own, so «Не упустить» is exact. */
  const gwen = `memory-test-${randomBytes(4).toString("hex")}`;
  /** Days that come again (§19.8.7): a memory of its own, so «Не упустить» is exact. */
  const hana = `memory-test-${randomBytes(4).toString("hex")}`;

  const recordIds = async (
    owner: string,
    filter?: MemoryModule.MemoryRecordFilter
  ) => {
    const rows = await memory.listRecords(owner, filter);
    return rows.map((r) => r.id);
  };
  const recordTexts = async (
    owner: string,
    filter?: MemoryModule.MemoryRecordFilter
  ) => {
    const rows = await memory.listRecords(owner, filter);
    return rows.map((r) => r.text);
  };
  const entityIds = async (owner: string) => {
    const rows = await memory.listEntities(owner);
    return rows.map((e) => e.id);
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    process.env.SECRETS_KEY = randomBytes(32).toString("base64");
    // The app's environment is read whole: what the store does not use still has to be there (CI has no .env).
    process.env.BETTER_AUTH_SECRET ??= randomBytes(32).toString("base64");
    process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
    await runMigrations(URL as string);
    const dbModule = await import("./db");
    ({ db } = dbModule.getDb());
    memory = await import("./memory");
    await db.insert(user).values(
      [ana, bob, cleo, dana, ella, fern, gwen, hana].map((id) => ({
        email: `${id}@example.test`,
        id,
        name: id,
      }))
    );
  });

  afterAll(async () => {
    await db
      ?.delete(user)
      .where(inArray(user.id, [ana, bob, cleo, dana, ella, fern, gwen, hana]));
  });

  it("keeps texts and names sealed, and reads them back", async () => {
    const entity = await memory.createEntity(ana, {
      aliases: ["Андрюша"],
      kind: "person",
      name: "Андрей Смирнов",
      role: "закупщик",
    });
    const record = await memory.addRecord(ana, {
      entities: [{ entityId: entity.id, role: "about" }],
      kind: "fact",
      text: "Андрей Смирнов уходит в декрет в декабре",
    });
    const [raw] = await db
      .select()
      .from(memoryRecords)
      .where(eq(memoryRecords.id, record.id));
    expect(raw?.sealed).not.toContain("декрет");
    const entities = await memory.listEntities(ana);
    expect(entities.map((e) => e.name)).toContain("Андрей Смирнов");
    expect(await recordTexts(ana, { entityId: entity.id })).toEqual([
      "Андрей Смирнов уходит в декрет в декабре",
    ]);
  });

  it("shows one person nothing of another's", async () => {
    const mine = await memory.createEntity(ana, {
      kind: "org",
      name: "Вектор",
    });
    const record = await memory.addRecord(ana, {
      entities: [{ entityId: mine.id, role: "about" }],
      kind: "fact",
      text: "Вектор — перевозчик",
    });
    expect(await memory.listEntities(bob)).toEqual([]);
    expect(await memory.listRecords(bob)).toEqual([]);
    // Bob has no key yet, and writing under his name to Ana's card is refused.
    await expect(
      memory.addRecord(bob, {
        entities: [{ entityId: mine.id, role: "about" }],
        kind: "fact",
        text: "чужое",
      })
    ).rejects.toThrow(/not the owner's/u);
    expect(await memory.deleteRecord(bob, record.id)).toBe(false);
    expect(await memory.updateEntity(bob, mine.id, { name: "x" })).toBeNull();
    expect(
      await memory.supersedeRecord(bob, record.id, {
        entities: [],
        kind: "fact",
        text: "чужое",
      })
    ).toBeNull();
    expect(await recordIds(ana)).toContain(record.id);
  });

  it("gives a commitment a status and nothing else", async () => {
    const commitment = await memory.addRecord(ana, {
      dueAt: new Date("2026-11-20T00:00:00Z"),
      entities: [],
      givenAt: new Date("2026-11-03T00:00:00Z"),
      kind: "commitment",
      text: "Ольга Ли пришлёт договор",
    });
    expect(commitment.status).toBe("open");
    expect(commitment.important).toBe(false);
    await expect(
      memory.addRecord(ana, {
        entities: [],
        important: true,
        kind: "event",
        text: "не обязательство",
      })
    ).rejects.toThrow(/only a commitment/u);
    await expect(
      memory.addRecord(ana, {
        entities: [],
        kind: "fact",
        status: "open",
        text: "не обязательство",
      })
    ).rejects.toThrow(/only a commitment/u);
    await expect(
      memory.addRecord(ana, { entities: [], kind: "fact", text: "   " })
    ).rejects.toThrow(/needs a text/u);
  });

  it("hides what is deleted and brings it back", async () => {
    const record = await memory.addRecord(ana, {
      entities: [],
      kind: "event",
      occurred: { at: new Date("2026-11-05T00:00:00Z"), precision: "day" },
      text: "Встреча с Андреем",
    });
    expect(await memory.deleteRecord(ana, record.id)).toBe(true);
    const ids = async (includeDeleted = false) =>
      await recordIds(ana, { includeDeleted });
    expect(await ids()).not.toContain(record.id);
    expect(await ids(true)).toContain(record.id);
    expect(await memory.restoreRecord(ana, record.id)).toBe(true);
    expect(await ids()).toContain(record.id);
  });

  it("keeps a correction's old version in the history", async () => {
    const was = await memory.addRecord(ana, {
      entities: [],
      kind: "event",
      occurred: { at: new Date("2026-11-04T00:00:00Z"), precision: "day" },
      text: "Виделись в среду",
    });
    const next = await memory.supersedeRecord(ana, was.id, {
      entities: [],
      kind: "event",
      occurred: { at: new Date("2026-11-05T00:00:00Z"), precision: "day" },
      text: "Виделись в четверг",
    });
    const live = await recordIds(ana);
    expect(live).toContain(next?.id);
    expect(live).not.toContain(was.id);
    const all = await memory.listRecords(ana, { includeSuperseded: true });
    expect(all.find((r) => r.id === was.id)?.supersededAt).not.toBeNull();
    // A replaced record is not replaced twice.
    expect(
      await memory.supersedeRecord(ana, was.id, {
        entities: [],
        kind: "event",
        text: "ещё раз",
      })
    ).toBeNull();
  });

  describe("writes", () => {
    let chatId: string;
    beforeAll(async () => {
      const [chat] = await db
        .insert(chats)
        .values({ title: "memory test", userId: ana })
        .returning({ id: chats.id });
      chatId = chat?.id as string;
    });

    const write = async () => {
      const made = await chatWrite(ana, {
        chatId,
        messageId: crypto.randomUUID(),
      });
      return made.id;
    };

    it("reads a person's queue by when the messages were sent; a failed one stays first (§19.8.1)", async () => {
      const [chat] = await db
        .insert(chats)
        .values({ title: "queue", userId: fern })
        .returning({ id: chats.id });
      const queued = (minute: number) =>
        chatWrite(fern, {
          chatId: chat?.id as string,
          messageId: crypto.randomUUID(),
          sentAt: new Date(Date.UTC(2026, 10, 9, 10, minute)),
          timeZone: "Europe/Moscow",
        });
      // Queued out of order: the later message first.
      const late = await queued(5);
      const early = await queued(1);
      expect(await memory.nextQueuedWrite(fern)).toMatchObject({
        attempts: 0,
        id: early.id,
        timeZone: "Europe/Moscow",
      });
      expect(
        await memory.failWriteAttempt(fern, early.id, "timeout", 3)
      ).toEqual({ failed: false });
      expect(await memory.nextQueuedWrite(fern)).toMatchObject({
        attempts: 1,
        id: early.id,
      });
      await memory.failWriteAttempt(fern, early.id, "timeout", 3);
      expect(
        await memory.failWriteAttempt(fern, early.id, "timeout", 3)
      ).toEqual({ failed: true });
      // Given up: the queue goes on to the next message.
      const next = await memory.nextQueuedWrite(fern);
      expect(next?.id).toBe(late.id);
      await memory.markWrite(fern, late.id, "skipped");
      expect(await memory.nextQueuedWrite(fern)).toBeNull();
      // Another person's queue is their own.
      const others = await memory.nextQueuedWrite(ana);
      expect(others?.id).not.toBe(late.id);
    });

    it("takes one message once", async () => {
      const messageId = crypto.randomUUID();
      const first = await chatWrite(ana, { chatId, messageId });
      const again = await chatWrite(ana, { chatId, messageId });
      expect(first.created).toBe(true);
      expect(again).toMatchObject({ created: false, id: first.id });
    });

    it("keeps the memory when the chat goes", async () => {
      const [chat] = await db
        .insert(chats)
        .values({ title: "to delete", userId: ana })
        .returning({ id: chats.id });
      const made = await chatWrite(ana, {
        chatId: chat?.id as string,
        messageId: crypto.randomUUID(),
      });
      const record = await memory.addRecord(ana, {
        entities: [],
        kind: "fact",
        text: "Из удалённого чата",
        writeId: made.id,
      });
      await db.delete(chats).where(eq(chats.id, chat?.id as string));
      expect(await recordIds(ana)).toContain(record.id);
    });

    it("undoes what a write put in, closed and found", async () => {
      // W1: a new card and a promise to it.
      const w1 = await write();
      const card = await memory.createEntity(ana, {
        kind: "person",
        name: "Игорь Петров",
        writeId: w1,
      });
      const promise = await memory.addRecord(ana, {
        entities: [{ entityId: card.id, role: "creditor" }],
        kind: "commitment",
        text: "Прислать смету Игорю Петрову",
        writeId: w1,
      });
      // W2: the promise is kept, and a fact is ended.
      const w2 = await write();
      const fact = await memory.addRecord(ana, {
        entities: [{ entityId: card.id, role: "about" }],
        kind: "fact",
        text: "Игорь Петров — в отпуске",
      });
      expect(
        await memory.setCommitmentStatus(ana, promise.id, "done", w2)
      ).toBe(true);
      expect(await memory.setValidTo(ana, fact.id, new Date(), w2)).toBe(true);
      const state = async () => {
        const all = await memory.listRecords(ana, { includeDeleted: true });
        return {
          fact: all.find((r) => r.id === fact.id),
          promise: all.find((r) => r.id === promise.id),
        };
      };
      const closed = await state();
      expect(closed.promise?.status).toBe("done");
      expect(closed.promise?.doneAt).not.toBeNull();

      // Undoing W2 opens both again; the card and the promise stay.
      expect(await memory.undoWrite(ana, w2)).toBe(true);
      expect(await memory.undoWrite(ana, w2)).toBe(false);
      let now = await state();
      expect(now.promise).toMatchObject({
        deletedAt: null,
        doneAt: null,
        status: "open",
      });
      expect(now.fact?.validTo).toBeNull();
      expect(await entityIds(ana)).toContain(card.id);

      // Undoing W1 hides the promise and takes the card away: the fact of W-none still holds it.
      expect(await memory.undoWrite(ana, w1)).toBe(true);
      now = await state();
      expect(now.promise?.deletedAt).not.toBeNull();
      expect(await entityIds(ana)).toContain(card.id);
      // …until nothing live holds it.
      await memory.deleteRecord(ana, fact.id);
      const w3 = await write();
      const lone = await memory.createEntity(ana, {
        kind: "org",
        name: "Ромашка",
        writeId: w3,
      });
      await memory.addRecord(ana, {
        entities: [{ entityId: lone.id, role: "about" }],
        kind: "fact",
        text: "Ромашка — поставщик",
        writeId: w3,
      });
      await memory.undoWrite(ana, w3);
      expect(await entityIds(ana)).not.toContain(lone.id);
    });

    it("cancels a commitment or takes «done» on someone's word, and the write's undo puts back what was", async () => {
      const promise = await memory.addRecord(ana, {
        entities: [],
        kind: "commitment",
        text: "Позвонить Андрею Седову",
      });
      const status = async () => {
        const all = await memory.listRecords(ana);
        return all.find((r) => r.id === promise.id);
      };

      const said = await write();
      await memory.setCommitmentStatus(ana, promise.id, "unconfirmed", said);
      // Not over yet: it waits for the person, so no end date.
      expect(await status()).toMatchObject({
        doneAt: null,
        status: "unconfirmed",
      });

      const cancelled = await write();
      await memory.setCommitmentStatus(ana, promise.id, "cancelled", cancelled);
      const over = await status();
      expect(over?.doneAt).not.toBeNull();
      await memory.undoWrite(ana, cancelled);
      expect(await status()).toMatchObject({
        doneAt: null,
        status: "unconfirmed",
      });
      await memory.undoWrite(ana, said);
      expect(await status()).toMatchObject({ status: "open" });
    });

    it("keeps a commitment's history, and undoing a write leaves what was changed by hand", async () => {
      const promise = await memory.addRecord(ana, {
        dueAt: new Date("2026-11-12T21:00:00Z"),
        entities: [],
        kind: "commitment",
        text: "Прислать смету Игорю Белову",
      });
      const status = async () => {
        const all = await memory.listRecords(ana);
        return all.find((r) => r.id === promise.id);
      };
      const said = await write();
      await memory.setCommitmentStatus(ana, promise.id, "done", said);
      // By hand: a later deadline and «важно»; a patch that changes nothing leaves no line.
      expect(
        await memory.editCommitment(ana, promise.id, {
          dueAt: new Date("2026-11-16T21:00:00Z"),
          important: true,
        })
      ).toBe(true);
      expect(
        await memory.editCommitment(ana, promise.id, { important: true })
      ).toBe(true);
      let history = await memory.recordHistory(ana, promise.id);
      expect(
        history?.changes.map((c) => [c.field, c.before, c.after, c.writeId])
      ).toEqual([
        ["status", "open", "done", said],
        ["due", "2026-11-12T21:00:00.000Z", "2026-11-16T21:00:00.000Z", null],
        ["important", "false", "true", null],
      ]);

      await memory.undoWrite(ana, said);
      expect(await status()).toMatchObject({
        dueAt: new Date("2026-11-16T21:00:00Z"),
        important: true,
        status: "open",
      });
      history = await memory.recordHistory(ana, promise.id);
      expect(history?.changes.map((c) => c.field)).toEqual([
        "due",
        "important",
      ]);

      // Changed by hand after the message: the message's undo leaves it.
      const again = await write();
      await memory.setCommitmentStatus(ana, promise.id, "done", again);
      await memory.editCommitment(ana, promise.id, { status: "cancelled" });
      await memory.undoWrite(ana, again);
      const kept = await status();
      expect(kept?.status).toBe("cancelled");

      // Only a live commitment of the owner's.
      expect(
        await memory.editCommitment(bob, promise.id, { important: false })
      ).toBe(false);
      expect(await memory.recordHistory(bob, promise.id)).toBeNull();
    });

    it("settles an open commitment from a message, shows it under the answer, and undoes it", async () => {
      const call = await memory.addRecord(ana, {
        entities: [],
        kind: "commitment",
        text: "Позвонить Андрею Седову",
      });
      const done = await memory.addRecord(ana, {
        entities: [],
        kind: "commitment",
        status: "done",
        text: "Уже сделанное",
      });
      const made = await chatWrite(ana, {
        chatId,
        messageId: crypto.randomUUID(),
      });
      expect(
        await memory.applyWrite(ana, made.id, {
          drafts: [],
          dues: [],
          ends: [],
          entities: [],
          records: [],
          statuses: [
            { recordId: call.id, status: "cancelled" },
            // Closed since the model read it: stays as it is.
            { recordId: done.id, status: "unconfirmed" },
          ],
        })
      ).toBe(true);
      const all = await memory.listRecords(ana, { kinds: ["commitment"] });
      expect(all.find((r) => r.id === call.id)).toMatchObject({
        closedByWrite: made.id,
        status: "cancelled",
      });
      expect(all.find((r) => r.id === done.id)?.status).toBe("done");

      const shown = await memory.chatMemory(ana, chatId);
      expect(shown.notes.find((n) => n.writeId === made.id)?.records).toEqual([
        { id: call.id, status: "cancelled", text: "Позвонить Андрею Седову" },
      ]);

      await memory.undoWrite(ana, made.id);
      const back = await memory.listRecords(ana, { kinds: ["commitment"] });
      expect(back.find((r) => r.id === call.id)?.status).toBe("open");
    });

    it("replaces a fact and an event from a message and moves a deadline — shown under the answer, undone with it (ARCH §19.9.3)", async () => {
      const project = await memory.createEntity(ana, {
        kind: "project",
        name: "Склад 2.0",
      });
      const about = [{ entityId: project.id, role: "about" as const }];
      const stage = await memory.addRecord(ana, {
        entities: about,
        kind: "fact",
        text: "«Склад 2.0» на этапе разработки",
        validFrom: new Date("2026-10-02T00:00:00Z"),
      });
      const meeting = await memory.addRecord(ana, {
        entities: about,
        kind: "event",
        occurred: { at: new Date("2026-11-11T00:00:00Z"), precision: "day" },
        text: "Встреча по складу в среду",
      });
      const promise = await memory.addRecord(ana, {
        dueAt: new Date("2026-11-12T21:00:00Z"),
        entities: [],
        kind: "commitment",
        text: "Прислать смету по складу",
      });
      const made = await chatWrite(ana, {
        chatId,
        messageId: crypto.randomUUID(),
      });
      expect(
        await memory.applyWrite(ana, made.id, {
          drafts: [],
          dues: [
            { dueAt: new Date("2026-11-15T21:00:00Z"), recordId: promise.id },
          ],
          ends: [],
          entities: [],
          records: [
            {
              entities: about,
              kind: "fact",
              replaces: stage.id,
              text: "«Склад 2.0» в тестировании",
              validFrom: new Date("2026-11-02T00:00:00Z"),
            },
            {
              entities: about,
              kind: "event",
              occurred: {
                at: new Date("2026-11-12T00:00:00Z"),
                precision: "day",
              },
              replaces: meeting.id,
              text: "Встреча по складу в четверг",
            },
          ],
          statuses: [],
        })
      ).toBe(true);

      const all = await memory.listRecords(ana, { includeSuperseded: true });
      const byId = (id: string) => all.find((r) => r.id === id);
      // The fact is ended on the day the new one begins; the event is set aside, not deleted.
      expect(byId(stage.id)).toMatchObject({
        closedByWrite: made.id,
        validTo: new Date("2026-11-02T00:00:00Z"),
      });
      expect(byId(meeting.id)?.supersededAt).not.toBeNull();
      expect(byId(promise.id)?.dueAt).toEqual(new Date("2026-11-15T21:00:00Z"));

      const shown = await memory.chatMemory(ana, chatId);
      const lines = shown.notes.find((n) => n.writeId === made.id)?.records;
      expect(lines).toEqual([
        expect.objectContaining({
          replaced: "«Склад 2.0» на этапе разработки",
          text: "«Склад 2.0» в тестировании",
        }),
        expect.objectContaining({
          replaced: "Встреча по складу в среду",
          text: "Встреча по складу в четверг",
        }),
        {
          due: {
            from: "2026-11-12T21:00:00.000Z",
            to: "2026-11-15T21:00:00.000Z",
          },
          id: promise.id,
          text: "Прислать смету по складу",
        },
      ]);

      // On the card the replaced meeting stands in «Раньше»; the old version of a hand correction does not.
      const page: typeof MemoryPageModule = await import("./memory-page");
      const card = await page.memoryCard(ana, project.id, "Europe/Moscow");
      expect(
        card?.records
          .filter((r) => r.kind === "event")
          .map((r) => [r.text, Boolean(r.supersededAt)])
      ).toEqual([
        ["Встреча по складу в четверг", false],
        ["Встреча по складу в среду", true],
      ]);

      await memory.undoWrite(ana, made.id);
      const back = await memory.listRecords(ana, { includeSuperseded: true });
      expect(back.find((r) => r.id === stage.id)).toMatchObject({
        closedByWrite: null,
        validTo: null,
      });
      expect(back.find((r) => r.id === meeting.id)?.supersededAt).toBeNull();
      expect(back.find((r) => r.id === promise.id)?.dueAt).toEqual(
        new Date("2026-11-12T21:00:00Z")
      );
      // Nothing of the write is left in the history.
      const history = await memory.recordHistory(ana, promise.id);
      expect(history?.changes).toEqual([]);
      await memory.correctRecord(
        ana,
        meeting.id,
        "Встреча по складу в среду в 15:00"
      );
      const fixed = await page.memoryCard(ana, project.id, "Europe/Moscow");
      expect(
        fixed?.records.filter((r) => r.kind === "event").map((r) => r.text)
      ).toEqual(["Встреча по складу в среду в 15:00"]);
    });

    it("lets a replacement stand only on a live record of the owner's that the new one does not precede", async () => {
      const project = await memory.createEntity(ana, {
        kind: "project",
        name: "Склад 3.0",
      });
      const about = [{ entityId: project.id, role: "about" as const }];
      const live = await memory.addRecord(ana, {
        entities: about,
        kind: "fact",
        text: "Склад 3.0 в тестировании",
        validFrom: new Date("2026-11-02T00:00:00Z"),
      });
      const foreign = await memory.addRecord(bob, {
        entities: [],
        kind: "fact",
        text: "Чужой факт",
      });
      const made = await chatWrite(ana, {
        chatId,
        messageId: crypto.randomUUID(),
      });
      await memory.applyWrite(ana, made.id, {
        drafts: [],
        dues: [],
        ends: [],
        entities: [],
        records: [
          // «В сентябре был на этапе дизайна»: older than the stage it would end — history, not a replacement.
          {
            entities: about,
            kind: "fact",
            replaces: live.id,
            text: "Склад 3.0 был на этапе дизайна",
            validFrom: new Date("2026-09-01T00:00:00Z"),
          },
          {
            entities: about,
            kind: "fact",
            replaces: foreign.id,
            text: "Склад 3.0 — для всех",
          },
        ],
        statuses: [],
      });
      const mine = await memory.listRecords(ana);
      expect(mine.find((r) => r.id === live.id)?.validTo).toBeNull();
      const theirs = await memory.listRecords(bob);
      expect(theirs.find((r) => r.id === foreign.id)?.validTo).toBeNull();
    });

    it("puts in a whole message at once, and only once", async () => {
      const made = await chatWrite(ana, {
        chatId,
        messageId: crypto.randomUUID(),
      });
      const known = await memory.createEntity(ana, {
        kind: "person",
        name: "Ольга Ли",
      });
      const plan: MemoryModule.MemoryWritePlan = {
        drafts: [],
        dues: [],
        ends: [],
        entities: [
          {
            kind: "org",
            name: "Стрела",
            ref: "new:strela",
            role: "перевозчик",
          },
        ],
        records: [
          {
            entities: [
              { entityId: known.id, role: "debtor" },
              { newRef: "new:strela", role: "creditor" },
            ],
            kind: "commitment",
            text: "Ольга Ли отправит договор Стреле",
          },
        ],
        statuses: [],
      };
      expect(await memory.applyWrite(ana, made.id, plan)).toBe(true);
      // The same job delivered twice puts nothing in twice.
      expect(await memory.applyWrite(ana, made.id, plan)).toBe(false);
      const records = await memory.listRecords(ana, { entityId: known.id });
      expect(records.map((r) => r.text)).toEqual([
        "Ольга Ли отправит договор Стреле",
      ]);
      const cards = await memory.listEntities(ana);
      const strela = cards.filter((e) => e.name === "Стрела");
      expect(strela).toHaveLength(1);
      expect(records[0]?.entities).toContainEqual({
        entityId: strela[0]?.id,
        role: "creditor",
      });
      const again = await chatWrite(ana, {
        chatId,
        messageId: crypto.randomUUID(),
      });
      expect(
        await memory.applyWrite(ana, again.id, {
          drafts: [],
          dues: [],
          ends: [],
          entities: [],
          records: [],
          statuses: [],
        })
      ).toBe(true);
      const skipped = await chatWrite(ana, {
        chatId,
        messageId: crypto.randomUUID(),
      });
      expect(skipped.status).toBe("queued");
    });

    it("forgets what deleted messages put in, and reads them afresh", async () => {
      const messageId = crypto.randomUUID();
      const made = await chatWrite(ana, { chatId, messageId });
      await memory.applyWrite(ana, made.id, {
        drafts: [],
        dues: [],
        ends: [],
        entities: [],
        records: [
          { entities: [], kind: "fact", text: "Из удалённого сообщения" },
        ],
        statuses: [],
      });
      // Another source's material under the same key is not this message.
      await memory.forgetSources(ana, "mail", [messageId]);
      expect(await recordTexts(ana)).toContain("Из удалённого сообщения");
      await memory.forgetSources(ana, memory.CHAT_SOURCE, [
        messageId,
        crypto.randomUUID(),
      ]);
      expect(await recordTexts(ana)).not.toContain("Из удалённого сообщения");
      const anew = await chatWrite(ana, { chatId, messageId });
      expect(anew.created).toBe(true);
    });

    it("keeps each source's material apart: its own keys, its own place in the one queue (§19.9.5)", async () => {
      const [chat] = await db
        .insert(chats)
        .values({ title: "sources", userId: gwen })
        .returning({ id: chats.id });
      const key = crypto.randomUUID();
      const said = await chatWrite(gwen, {
        chatId: chat?.id as string,
        messageId: key,
        sentAt: noon(5),
      });
      // The same key in another source is other material; queued again there, it is the same write.
      const letter = { sentAt: noon(1), source: "mail", sourceKey: key };
      const mailed = await memory.createWrite(gwen, letter);
      expect(mailed).toMatchObject({ created: true });
      expect(mailed.id).not.toBe(said.id);
      expect(await memory.createWrite(gwen, letter)).toMatchObject({
        created: false,
        id: mailed.id,
      });
      // One queue by when it was said, whatever the source: the letter of 12:01 before the message of 12:05.
      expect(await memory.nextQueuedWrite(gwen)).toMatchObject({
        chatId: null,
        id: mailed.id,
        source: "mail",
        sourceKey: key,
      });
      await memory.markWrite(gwen, mailed.id, "done");
      expect(await memory.nextQueuedWrite(gwen)).toMatchObject({
        chatId: chat?.id,
        id: said.id,
        source: memory.CHAT_SOURCE,
        sourceKey: key,
      });
      await memory.markWrite(gwen, said.id, "skipped");
    });

    it("keeps a note's words on its write, sealed, and gives them to the owner only (P22)", async () => {
      const words = "обещала прислать план работ к пятнице";
      const note = await memory.createWrite(gwen, {
        material: { about: crypto.randomUUID(), text: words },
        source: memory.NOTE_SOURCE,
        sourceKey: crypto.randomUUID(),
      });
      const [row] = await db
        .select({ sealed: memoryWrites.sealed })
        .from(memoryWrites)
        .where(eq(memoryWrites.id, note.id));
      expect(row?.sealed).toBeTruthy();
      expect(row?.sealed).not.toContain("пятниц");
      expect(await memory.materialOf(gwen, note.id)).toMatchObject({
        text: words,
      });
      expect(await memory.materialOf(ana, note.id)).toBeNull();
      expect(await memory.writeStatus(gwen, note.id)).toBe("queued");
      expect(await memory.writeStatus(ana, note.id)).toBeNull();
      await memory.markWrite(gwen, note.id, "skipped");
    });

    /** A write with one question: «Какой Андрей?» between two new cards. */
    const ask = async () => {
      const made = await chatWrite(ana, {
        chatId,
        messageId: crypto.randomUUID(),
      });
      const one = await memory.createEntity(ana, {
        kind: "person",
        name: "Андрей Первый",
      });
      const two = await memory.createEntity(ana, {
        kind: "person",
        name: "Андрей Второй",
      });
      await memory.applyWrite(ana, made.id, {
        drafts: [
          {
            candidates: [one.id, two.id],
            name: "Андрей",
            question: "Какой Андрей уходит в отпуск?",
            records: [
              {
                entities: [{ ask: "ask:a", role: "about" }],
                kind: "fact",
                text: "Андрей в отпуске с 10 ноября",
                validFrom: new Date("2026-11-09T21:00:00Z"),
              },
            ],
          },
        ],
        dues: [],
        ends: [],
        entities: [],
        records: [],
        statuses: [],
      });
      const questions = await memory.listQuestions(ana, { chatId });
      const question = questions.find((q) => q.writeId === made.id);
      return { made, one, question, two };
    };

    describe("questions (P18)", () => {
      it("asks in its chat with the cards to pick from, and only its owner", async () => {
        const { one, question, two } = await ask();
        expect(question).toMatchObject({
          candidates: [
            { id: one.id, name: "Андрей Первый" },
            { id: two.id, name: "Андрей Второй" },
          ],
          question: "Какой Андрей уходит в отпуск?",
        });
        expect(await memory.listQuestions(bob)).toEqual([]);
        expect(
          await memory.answerQuestion(bob, question?.id as string, {
            dismiss: true,
          })
        ).toBeNull();
      });

      it("gives up a question nobody answered in two weeks, and what waited for it is not written (§19.8.6)", async () => {
        const { question } = await ask();
        const id = question?.id as string;
        const waiting = async () => {
          const all = await memory.listRecords(ana);
          return all.filter((r) => r.text === "Андрей в отпуске с 10 ноября")
            .length;
        };
        const asked = async () => {
          const list = await memory.listQuestions(ana);
          return list.some((q) => q.id === id);
        };
        const before = await waiting();
        expect(await asked()).toBe(true);
        await db
          .update(memoryDrafts)
          .set({ createdAt: new Date(Date.now() - 15 * 86_400_000) })
          .where(eq(memoryDrafts.id, id));
        expect(await asked()).toBe(false);
        // Given up for good: it cannot be answered any more, and nothing of it went in.
        const answered = await memory.answerQuestion(ana, id, {
          dismiss: true,
        });
        expect(answered).toBeNull();
        const [row] = await db
          .select({ status: memoryDrafts.status })
          .from(memoryDrafts)
          .where(eq(memoryDrafts.id, id));
        expect(row?.status).toBe("expired");
        expect(await waiting()).toBe(before);
      });

      it("puts the records in under the picked card, once", async () => {
        const { one, question } = await ask();
        const id = question?.id as string;
        const records = await memory.answerQuestion(ana, id, {
          entityId: one.id,
        });
        expect(records?.[0]).toMatchObject({
          entities: [{ entityId: one.id, role: "about" }],
          text: "Андрей в отпуске с 10 ноября",
          validFrom: new Date("2026-11-09T21:00:00Z"),
        });
        // Answered in another tab already.
        expect(
          await memory.answerQuestion(ana, id, { entityId: one.id })
        ).toBeNull();
        const left = await memory.listQuestions(ana);
        expect(left.map((q) => q.id)).not.toContain(id);
      });

      it("refuses a card that is not one of the question's", async () => {
        const { question } = await ask();
        const other = await memory.createEntity(ana, {
          kind: "person",
          name: "Посторонний",
        });
        await expect(
          memory.answerQuestion(ana, question?.id as string, {
            entityId: other.id,
          })
        ).rejects.toThrow(/not one of the question/u);
      });

      it("makes a new card when it is none of them, and «Отменить» takes it all back", async () => {
        const { made, question } = await ask();
        const records = await memory.answerQuestion(
          ana,
          question?.id as string,
          {
            newCard: true,
          }
        );
        const cards = await memory.listEntities(ana);
        const fresh = cards.find(
          (e) => e.id === records?.[0]?.entities[0]?.entityId
        );
        expect(fresh).toMatchObject({ kind: "person", name: "Андрей" });
        await memory.undoWrite(ana, made.id);
        expect(await recordIds(ana)).not.toContain(records?.[0]?.id);
        expect(await entityIds(ana)).not.toContain(fresh?.id);
      });

      it("drops the question when it is turned away or its write undone", async () => {
        const first = await ask();
        expect(
          await memory.answerQuestion(ana, first.question?.id as string, {
            dismiss: true,
          })
        ).toEqual([]);
        const second = await ask();
        await memory.undoWrite(ana, second.made.id);
        const open = await memory.listQuestions(ana);
        expect(open.map((q) => q.id)).not.toContain(first.question?.id);
        expect(open.map((q) => q.id)).not.toContain(second.question?.id);
      });
    });

    it("ends a membership by a message, and «Отменить» brings it back (ARCH §19)", async () => {
      const team = await memory.createEntity(ana, {
        kind: "group",
        name: "Отдел продаж",
      });
      const who = await memory.createEntity(ana, {
        kind: "person",
        name: "Нина Сом",
      });
      const inSales = await memory.addRecord(ana, {
        entities: [
          { entityId: who.id, role: "about" },
          { entityId: team.id, role: "group" },
        ],
        kind: "fact",
        text: "Нина Сом в отделе продаж",
      });
      const left = await chatWrite(ana, {
        chatId,
        messageId: crypto.randomUUID(),
      });
      await memory.applyWrite(ana, left.id, {
        drafts: [],
        dues: [],
        ends: [inSales.id],
        entities: [],
        records: [],
        statuses: [],
      });
      const ended = async () => {
        const all = await memory.listRecords(ana, { entityId: team.id });
        return all.find((r) => r.id === inSales.id)?.validTo ?? null;
      };
      expect(await ended()).not.toBeNull();
      await memory.undoWrite(ana, left.id);
      expect(await ended()).toBeNull();
    });

    it("puts back what a write's correction replaced", async () => {
      const was = await memory.addRecord(ana, {
        entities: [],
        kind: "fact",
        text: "Проект на этапе дизайна",
      });
      const w = await write();
      const next = await memory.supersedeRecord(ana, was.id, {
        entities: [],
        kind: "fact",
        text: "Проект на этапе тестирования",
        writeId: w,
      });
      expect(await recordIds(ana)).toEqual(expect.arrayContaining([next?.id]));
      await memory.undoWrite(ana, w);
      const live = await recordIds(ana);
      expect(live).toContain(was.id);
      expect(live).not.toContain(next?.id);
    });
  });

  it("puts the «Память» page together: cards with counts, a card, search and «Откуда» (P16)", async () => {
    const page: typeof MemoryPageModule = await import("./memory-page");
    const [chat] = await db
      .insert(chats)
      .values({ title: "Договор с перевозчиком", userId: cleo })
      .returning({ id: chats.id });
    const chatId = chat?.id as string;
    const messageId = crypto.randomUUID();
    await db.insert(messages).values({
      chatId,
      id: messageId,
      parts: [
        { text: "Ольга обещала прислать договор до 13 ноября", type: "text" },
      ],
      role: "user",
    });
    const made = await chatWrite(cleo, { chatId, messageId });
    const olga = await memory.createEntity(cleo, {
      kind: "person",
      name: "Ольга Ли",
      role: "менеджер «Альфа-Логистики»",
    });
    const self = await memory.ensureSelf(cleo, "Клео");
    const sides = [
      { entityId: olga.id, role: "debtor" as const },
      { entityId: self.id, role: "creditor" as const },
    ];
    const late = await memory.addRecord(cleo, {
      dueAt: new Date("2026-11-02T21:00:00Z"),
      entities: sides,
      kind: "commitment",
      text: "Ольга Ли пришлёт договор",
      writeId: made.id,
    });
    await memory.addRecord(cleo, {
      dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      entities: sides,
      kind: "commitment",
      text: "Ольга Ли пришлёт акт",
    });
    await memory.addRecord(cleo, {
      entities: sides,
      kind: "commitment",
      status: "done",
      text: "Ольга Ли прислала счёт",
    });
    await memory.addRecord(cleo, {
      entities: [{ entityId: self.id, role: "subject" }],
      kind: "rule",
      text: "Встреча один на один раз в две недели",
    });

    // What the person told about themselves is «Обо мне»; promises they owe are not.
    const mine = await memory.addRecord(cleo, {
      entities: [{ entityId: self.id, role: "about" }],
      kind: "fact",
      text: "У нас есть Mac Studio на 256 ГБ",
    });
    const overview = await page.memoryOverview(cleo);
    expect(overview.me.map((r) => r.id)).toEqual([mine.id]);
    // Taken away again: the chat's block below is about the cards a message mentions.
    await memory.deleteRecord(cleo, mine.id);
    // The person's own card is not in the list.
    expect(overview.cards).toEqual([
      expect.objectContaining({ id: olga.id, open: 2, overdue: 1 }),
    ]);
    expect(overview.rules.map((r) => r.text)).toEqual([
      "Встреча один на один раз в две недели",
    ]);

    const card = await page.memoryCard(cleo, olga.id, "Europe/Moscow");
    expect(card?.records).toHaveLength(3);
    expect(card?.records.find((r) => r.id === late.id)).toMatchObject({
      chatId,
      entities: [
        { id: olga.id, kind: "person", name: "Ольга Ли", role: "debtor" },
        { id: self.id, kind: "self", name: "Клео", role: "creditor" },
      ],
      fromChat: true,
    });
    expect(await page.memoryCard(cleo, self.id, "Europe/Moscow")).toBeNull();

    // A card by hand («+» next to a section): made once; the same name again — that card, not a second one.
    const group = await page.createCard(cleo, {
      kind: "group",
      name: "Подрядчики",
    });
    expect(group).toMatchObject({
      card: { kind: "group", name: "Подрядчики", open: 0 },
      existed: false,
    });
    const again = await page.createCard(cleo, {
      kind: "org",
      name: " подрядчики ",
    });
    expect(again).toMatchObject({ existed: true });
    expect(again.card.id).toBe(group.card.id);
    const thing = await page.createCard(cleo, {
      kind: "custom",
      name: "Автобус 9",
      type: "автобус",
    });
    expect(thing.card).toMatchObject({ kind: "custom", type: "автобус" });
    expect(await page.memoryCard(bob, olga.id, "Europe/Moscow")).toBeNull();

    // Every word, any order, ё as е; done ones too.
    const found = await page.searchMemory(cleo, "СЧЁТ ольга");
    expect(found.records.map((r) => r.status)).toEqual(["done"]);
    const byRole = await page.searchMemory(cleo, "альфа");
    expect(byRole.cards).toHaveLength(1);
    expect(await page.searchMemory(cleo, "  ")).toEqual({
      cards: [],
      records: [],
    });

    // Corrected by hand: a new version, the source and the history follow it.
    const fixed = await memory.correctRecord(
      cleo,
      late.id,
      "Ольга Ли пришлёт подписанный договор"
    );
    await memory.editCommitment(cleo, fixed?.id as string, {
      status: "done",
    });
    const source = await page.recordSource(cleo, fixed?.id as string);
    expect(source).toMatchObject({
      chat: { id: chatId, title: "Договор с перевозчиком" },
      said: "Ольга обещала прислать договор до 13 ноября",
      versions: [{ text: "Ольга Ли пришлёт договор" }],
    });
    expect(source?.changes).toEqual([
      expect.objectContaining({ after: "done", byHand: true, field: "status" }),
    ]);
    expect(await page.recordSource(bob, late.id)).toBeNull();

    // The chat reads it (Б4): the mentioned card in a block, and the tools.
    const read: typeof MemoryReadModule = await import("./memory-read");
    const brief = await read.memoryBrief(
      cleo,
      "Что с Ольгой?",
      "Europe/Moscow"
    );
    expect(brief).toContain(
      `- Ольга Ли [${read.shortId(olga.id)}] (person; менеджер «Альфа-Логистики»)`
    );
    expect(brief).toContain(
      "promise: «Ольга Ли пришлёт акт» (by Ольга Ли to the user, due"
    );
    // Closed ones stay out of the block. A message about no one still gets what goes with every message (Г2.3) —
    // here Olga as a card the person deals with — but no one's records.
    expect(brief).not.toContain("прислала счёт");
    const none = await read.memoryBrief(cleo, "посчитай 15%", "UTC");
    expect(none).not.toContain("About who this message mentions");
    expect(none).toContain(`- Ольга Ли [${read.shortId(olga.id)}]`);
    expect(await read.memoryBrief(bob, "посчитай 15%", "UTC")).toBe("");
    const tools = read.memoryTools(cleo, "Europe/Moscow");
    const run = (name: string, input: object) => {
      const execute = tools[name]?.execute as
        | ((i: object, o: object) => Promise<unknown>)
        | undefined;
      if (!execute) {
        throw new Error(`no ${name}`);
      }
      return execute(input, { messages: [], toolCallId: "t" });
    };
    expect(
      await run(read.LIST_COMMITMENTS, { overdueOnly: true })
    ).toMatchObject({ promises: [] });
    const all = (await run(read.LIST_COMMITMENTS, {})) as {
      promises: string[];
    };
    expect(all.promises).toHaveLength(1);
    expect(await run(read.MEMORY_CARD, { name: "Ольгу" })).toMatchObject({
      found: true,
      name: "Ольга Ли",
    });
    // By meaning: everyone with what is known, for the model to pick from; the person's own card is not among them.
    const listed = (await run(read.LIST_CARDS, {})) as {
      cards: { id: string; name: string }[];
    };
    expect(listed.cards).toEqual([
      expect.objectContaining({ id: read.shortId(olga.id), name: "Ольга Ли" }),
    ]);
    // By the id the block shows; two cards a name fits come back to choose from.
    expect(brief).toContain(`- Ольга Ли [${read.shortId(olga.id)}]`);
    expect(
      await run(read.MEMORY_CARD, { id: `[${read.shortId(olga.id)}]` })
    ).toMatchObject({ found: true, name: "Ольга Ли" });
    const twin = await memory.createEntity(cleo, {
      kind: "person",
      name: "Ольга Петрова",
    });
    expect(await run(read.MEMORY_CARD, { name: "Ольга" })).toEqual({
      candidates: [
        expect.objectContaining({ id: read.shortId(olga.id) }),
        expect.objectContaining({ id: read.shortId(twin.id) }),
      ],
      found: false,
    });
    // Someone else's card is nobody's here.
    expect(
      await run(read.MEMORY_CARD, { id: read.shortId(olga.id) })
    ).toMatchObject({ found: true });
    const bobTools = read.memoryTools(bob, "UTC");
    const foreign = bobTools[read.MEMORY_CARD]?.execute as (
      i: object,
      o: object
    ) => Promise<unknown>;
    expect(
      await foreign(
        { id: read.shortId(olga.id) },
        { messages: [], toolCallId: "t" }
      )
    ).toEqual({ found: false });

    // Who she is now: the newest role fact is the card's line, a later edit by hand wins, a deleted fact gives it back.
    const role = async () => {
      const cards = await memory.listEntities(cleo);
      return cards.find((e) => e.id === olga.id)?.role;
    };
    const promoted = await memory.addRecord(cleo, {
      entities: [{ entityId: olga.id, role: "about" }],
      kind: "fact",
      role: "директор «Альфа-Логистики»",
      text: "Ольга Ли теперь директор «Альфа-Логистики»",
    });
    expect(await role()).toBe("директор «Альфа-Логистики»");
    await memory.deleteRecord(cleo, promoted.id);
    expect(await role()).toBe("менеджер «Альфа-Логистики»");
    await memory.restoreRecord(cleo, promoted.id);
    await memory.updateEntity(cleo, olga.id, { role: "партнёр" });
    expect(await role()).toBe("партнёр");

    // What the person told about themselves goes with every message, whoever it mentions.
    await memory.addRecord(cleo, {
      entities: [{ entityId: self.id, role: "about" }],
      kind: "fact",
      text: "Развиваю своих подчинённых: даю им задачи на рост",
    });
    const own = await read.memoryBrief(cleo, "посчитай 15%", "UTC");
    expect(own).toContain("About the user");
    expect(own).toContain(
      "«Развиваю своих подчинённых: даю им задачи на рост»"
    );
    expect(own).not.toContain("About who this message mentions");
  });

  it("gathers «На сегодня»: important first, then past due, said done, tomorrow — and «Убрать» until it changes (P17)", async () => {
    const today: typeof MemoryTodayModule = await import("./memory-today");
    const self = await memory.ensureSelf(dana, "Дана");
    const olga = await memory.createEntity(dana, {
      kind: "person",
      name: "Ольга Ли",
    });
    const add = (
      text: string,
      extra: Partial<MemoryModule.MemoryRecordInput>
    ) =>
      memory.addRecord(dana, {
        entities: owes(olga.id, self.id),
        kind: "commitment",
        text,
        ...extra,
      });
    // Monday 9 November in Moscow; deadlines are midnights there.
    const now = new Date("2026-11-09T09:00:00Z");
    const late = await add("Ольга Ли пришлёт договор", {
      dueAt: new Date("2026-11-05T21:00:00Z"),
    });
    const mine = await memory.addRecord(dana, {
      dueAt: new Date("2026-11-09T21:00:00Z"),
      entities: owes(self.id, olga.id),
      kind: "commitment",
      text: "Отправить Ольге Ли реквизиты",
    });
    const said = await add("Ольга Ли подготовит акт", {
      status: "unconfirmed",
    });
    const key = await add("Ольга Ли согласует пилот", { important: true });
    await add("Ольга Ли пришлёт отчёт", {
      dueAt: new Date("2026-11-19T21:00:00Z"),
    });
    await add("Ольга Ли прислала счёт", {
      dueAt: new Date("2026-11-01T21:00:00Z"),
      status: "done",
    });

    const list = await today.todaySuggestions(dana, "Europe/Moscow", now);
    expect(list.map((s) => [s.id, s.reason, s.side])).toEqual([
      [key.id, "important", "theirs"],
      [late.id, "overdue", "theirs"],
      [said.id, "unconfirmed", "theirs"],
      [mine.id, "tomorrow", "mine"],
    ]);
    expect(list[1]).toMatchObject({
      days: 3,
      who: { id: olga.id, name: "Ольга Ли" },
    });

    // «Убрать»: gone while the deadline stays; a new deadline brings it back; «Вернуть» too.
    expect(await memory.dismissSuggestion(dana, late.id)).toBe(true);
    const without = await today.todaySuggestions(dana, "Europe/Moscow", now);
    expect(without.map((s) => s.id)).not.toContain(late.id);
    await memory.editCommitment(dana, late.id, {
      dueAt: new Date("2026-11-07T21:00:00Z"),
    });
    const moved = await today.todaySuggestions(dana, "Europe/Moscow", now);
    expect(moved.find((s) => s.id === late.id)).toMatchObject({ days: 1 });
    await memory.dismissSuggestion(dana, late.id);
    expect(await memory.undismissSuggestion(dana, late.id)).toBe(true);
    expect(await memory.dismissSuggestion(bob, late.id)).toBe(false);
  });

  it("keeps the rules in «Не упустить»: a rhythm by the last contact, a wait in working days (ARCH §19.6)", async () => {
    const today: typeof MemoryTodayModule = await import("./memory-today");
    const self = await memory.ensureSelf(ella, "Элла");
    const card = (name: string, kind: "person" | "org" = "person") =>
      memory.createEntity(ella, { kind, name });
    const [andrey, igor, nina, vector, alfa] = await Promise.all([
      card("Андрей Седов"),
      card("Игорь Белов"),
      card("Нина Орлова"),
      card("ООО «Вектор»", "org"),
      card("«Альфа-Логистика»", "org"),
    ]);
    const rule = (
      text: string,
      cards: string[],
      r: NonNullable<MemoryModule.MemoryRecordInput["rule"]>
    ) =>
      memory.addRecord(ella, {
        entities: cards.map((entityId) => ({ entityId, role: "subject" })),
        kind: "rule",
        rule: r,
        text,
      });
    const met = (who: string, at: string) =>
      memory.addRecord(ella, {
        entities: [
          { entityId: who, role: "participant" },
          { entityId: self.id, role: "participant" },
        ],
        kind: "event",
        occurred: { at: new Date(at), precision: "day" },
        text: "Встреча",
      });
    // Monday 23 November 2026 in Moscow.
    const now = new Date("2026-11-23T09:00:00Z");
    const twoWeeks = { days: 14, kind: "rhythm", workingDays: false } as const;
    const team = await rule(
      "Один на один с каждым из команды раз в две недели",
      [andrey.id, igor.id, nina.id],
      twoWeeks
    );
    // Said on Monday 9 November, whatever day the test runs.
    await db
      .update(memoryRecords)
      .set({ recordedAt: new Date("2026-11-09T09:00:00Z") })
      .where(eq(memoryRecords.id, team.id));
    // Andrey met 18 days ago: due by the team's rule. Igor 7 days ago.
    await met(andrey.id, "2026-11-04T21:00:00Z");
    await met(igor.id, "2026-11-15T21:00:00Z");
    // Nina: no meeting yet — counted from when the rule was said (9 November): 14 days on the 23rd.
    // Said later for Igor: once a week now — 7 days since the 15th.
    const weekly = await rule("С Игорем Беловым раз в неделю", [igor.id], {
      days: 7,
      kind: "rhythm",
      workingDays: false,
    });
    // Without a deadline, waiting: 5 working days for anyone, 2 days for «Альфа-Логистика».
    // About «user» as the model gives it — that means anyone.
    await rule("Ответа ждём пять рабочих дней", [self.id], {
      days: 5,
      kind: "wait",
      workingDays: true,
    });
    await rule("От «Альфа-Логистики» ждём не больше двух дней", [alfa.id], {
      days: 2,
      kind: "wait",
      workingDays: false,
    });
    const waiting = (who: string, text: string, given: string) =>
      memory.addRecord(ella, {
        entities: owes(who, self.id),
        givenAt: new Date(given),
        kind: "commitment",
        text,
      });
    // Thursday 12 → Monday 23: 7 working days. Wednesday 18 → Monday 23: 3 working days. Saturday 21: 2 days.
    const vectorLong = await waiting(
      vector.id,
      "ООО «Вектор» ответит на предложение",
      "2026-11-11T21:00:00Z"
    );
    await waiting(
      vector.id,
      "ООО «Вектор» пришлёт прайс",
      "2026-11-17T21:00:00Z"
    );
    const alfaShort = await waiting(
      alfa.id,
      "«Альфа-Логистика» подтвердит рейс",
      "2026-11-20T21:00:00Z"
    );

    const list = await today.todaySuggestions(ella, "Europe/Moscow", now);
    expect(list.map((s) => [s.key, s.reason, s.days])).toEqual([
      [vectorLong.id, "waiting", 7],
      [alfaShort.id, "waiting", 2],
      [`${team.id}:${andrey.id}`, "rhythm", 18],
      [`${team.id}:${nina.id}`, "rhythm", 14],
      [`${weekly.id}:${igor.id}`, "rhythm", 7],
    ]);
    const rhythm = list.find((s) => s.who?.id === andrey.id);
    expect(rhythm).toMatchObject({
      id: team.id,
      kind: "rhythm",
      rhythm: { every: 14, since: "2026-11-04T21:00:00.000Z" },
      side: "mine",
      status: null,
      who: { id: andrey.id, name: "Андрей Седов" },
    });

    // «Убрать» keeps Andrey away until a new contact; a meeting resets the count.
    expect(
      await memory.dismissSuggestion(ella, team.id, {
        entityId: andrey.id,
        since: new Date("2026-11-04T21:00:00Z"),
      })
    ).toBe(true);
    const away = await today.todaySuggestions(ella, "Europe/Moscow", now);
    expect(away.map((s) => s.key)).not.toContain(`${team.id}:${andrey.id}`);
    await met(andrey.id, "2026-11-05T21:00:00Z");
    const back = await today.todaySuggestions(ella, "Europe/Moscow", now);
    expect(back.find((s) => s.key === `${team.id}:${andrey.id}`)).toMatchObject(
      { days: 17 }
    );
    expect(await memory.undismissSuggestion(ella, team.id, andrey.id)).toBe(
      true
    );
    // A commitment's own key still works, and a rule is no commitment to take away the old way.
    expect(await memory.dismissSuggestion(ella, vectorLong.id)).toBe(true);
    expect(await memory.dismissSuggestion(ella, team.id)).toBe(false);
  });

  it("keeps a group's rule with whoever is in the group now (ARCH §19)", async () => {
    const today: typeof MemoryTodayModule = await import("./memory-today");
    const team = await memory.createEntity(ella, {
      kind: "group",
      name: "Моя команда",
    });
    const card = (name: string) =>
      memory.createEntity(ella, { kind: "person", name });
    const [lena, oleg, pasha] = await Promise.all([
      card("Лена Котова"),
      card("Олег Лис"),
      card("Паша Дым"),
    ]);
    const join = (who: string) =>
      memory.addRecord(ella, {
        entities: [
          { entityId: who, role: "about" },
          { entityId: team.id, role: "group" },
        ],
        kind: "fact",
        text: "В моей команде",
      });
    await join(lena.id);
    const olegIn = await join(oleg.id);
    const rule = await memory.addRecord(ella, {
      entities: [{ entityId: team.id, role: "subject" }],
      kind: "rule",
      rule: { days: 14, kind: "rhythm", workingDays: false },
      text: "Один на один с каждым из моей команды раз в две недели",
    });
    // Fifteen days after the rule was said (today), nobody met: both are due — by the group's rule.
    const later = new Date(Date.now() + 15 * 86_400_000);
    const names = async () => {
      const list = await today.todaySuggestions(ella, "Europe/Moscow", later);
      return list.filter((s) => s.id === rule.id).map((s) => s.who?.name);
    };
    expect(await names()).toEqual(
      expect.arrayContaining(["Лена Котова", "Олег Лис"])
    );
    // Joined after the rule was said: counts at once. Left: no longer.
    await join(pasha.id);
    await memory.setValidTo(ella, olegIn.id, new Date());
    const now = await names();
    expect(now).toEqual(expect.arrayContaining(["Лена Котова", "Паша Дым"]));
    expect(now).not.toContain("Олег Лис");
  });

  it("shows a day that comes again near its day, and keeps it away until the next one (ARCH §19.8.7)", async () => {
    const today: typeof MemoryTodayModule = await import("./memory-today");
    const olga = await memory.createEntity(hana, {
      kind: "person",
      name: "Ольга Ли",
    });
    const birthday = await memory.addRecord(hana, {
      entities: [{ entityId: olga.id, role: "subject" }],
      kind: "rule",
      occurred: { at: new Date("1985-11-14T00:00:00+03:00"), precision: "day" },
      rule: { days: 0, kind: "date", repeat: "year", workingDays: false },
      text: "У Ольги день рождения 14 ноября",
    });
    // It comes back as the rule it is, a year's, with its day.
    const [kept] = await memory.listRecords(hana, { kinds: ["rule"] });
    expect(kept?.rule).toEqual({
      days: 0,
      kind: "date",
      repeat: "year",
      workingDays: false,
    });
    const rows = async (at: string) => {
      const list = await today.todaySuggestions(
        hana,
        "Europe/Moscow",
        new Date(at)
      );
      return list
        .filter((s) => s.id === birthday.id)
        .map((s) => [s.reason, s.date?.day, s.days, s.who?.name]);
    };
    // Three days ahead: shown; four: not yet.
    expect(await rows("2026-11-11T09:00:00Z")).toEqual([
      ["date", "2026-11-14", 3, "Ольга Ли"],
    ]);
    expect(await rows("2026-11-10T09:00:00Z")).toEqual([]);
    // «Уже сделано» keeps this year's day away, and next year's comes back.
    expect(
      await memory.dismissSuggestion(hana, birthday.id, undefined, "2026-11-14")
    ).toBe(true);
    expect(await rows("2026-11-11T09:00:00Z")).toEqual([]);
    expect(await rows("2027-11-11T09:00:00Z")).toHaveLength(1);
    expect(
      await memory.undismissSuggestion(
        hana,
        birthday.id,
        undefined,
        "2026-11-14"
      )
    ).toBe(true);
    expect(await rows("2026-11-11T09:00:00Z")).toHaveLength(1);
    // A weekly day shows the day before and the day itself, not earlier.
    const report = await memory.addRecord(hana, {
      entities: [],
      kind: "rule",
      occurred: { at: new Date("2026-11-06T00:00:00+03:00"), precision: "day" },
      rule: { days: 0, kind: "date", repeat: "week", workingDays: false },
      text: "Отчёт каждую пятницу",
    });
    const week = async (at: string) => {
      const list = await today.todaySuggestions(
        hana,
        "Europe/Moscow",
        new Date(at)
      );
      return list.filter((s) => s.id === report.id).map((s) => s.days);
    };
    // 13 November 2026 is a Friday.
    expect(await week("2026-11-11T09:00:00Z")).toEqual([]);
    expect(await week("2026-11-12T09:00:00Z")).toEqual([1]);
    expect(await week("2026-11-13T09:00:00Z")).toEqual([0]);
  });

  it("does not take a date rule without its day or its repeat (ARCH §19.8.7)", async () => {
    await expect(
      memory.addRecord(hana, {
        entities: [],
        kind: "rule",
        rule: { days: 0, kind: "date", repeat: "year", workingDays: false },
        text: "день рождения без дня",
      })
    ).rejects.toThrow();
    await expect(
      memory.addRecord(hana, {
        entities: [],
        kind: "rule",
        occurred: {
          at: new Date("2026-11-14T00:00:00+03:00"),
          precision: "day",
        },
        rule: { days: 0, kind: "date", workingDays: false },
        text: "день без повтора",
      })
    ).rejects.toThrow();
  });

  it("does what a Telegram button says for the owner of the promise, and for nobody else (D43)", async () => {
    const { runAction, tomorrowOf } = await import("./telegram-actions");
    const olga = await memory.createEntity(hana, {
      kind: "person",
      name: "Ольга из Telegram",
    });
    const self = await memory.ensureSelf(hana, "Я");
    const make = (text: string) =>
      memory.addRecord(hana, {
        dueAt: new Date(Date.now() + 5 * 86_400_000),
        entities: owes(olga.id, self.id),
        kind: "commitment",
        text,
      });
    const [a, b, c] = await Promise.all([
      make("Кнопка: выполнить"),
      make("Кнопка: завтра"),
      make("Кнопка: убрать"),
    ]);
    if (!(a && b && c)) {
      throw new Error("no records");
    }
    // Another person's button does nothing to it.
    expect(await runAction(bob, { action: "done", id: a.id })).toBe("gone");
    const still = await memory.listRecords(hana, { ids: [a.id] });
    expect(still[0]?.status).toBe("open");

    expect(await runAction(hana, { action: "done", id: a.id })).toBe("done");
    const [doneRecord] = await memory.listRecords(hana, { ids: [a.id] });
    expect(doneRecord?.status).toBe("done");

    expect(await runAction(hana, { action: "tomorrow", id: b.id })).toBe(
      "tomorrow"
    );
    const [moved] = await memory.listRecords(hana, { ids: [b.id] });
    // The person has no zone set: it is UTC, tomorrow's midnight.
    expect(moved?.dueAt?.toISOString()).toBe(
      tomorrowOf(new Date(), "UTC")?.toISOString()
    );

    expect(await runAction(hana, { action: "dismiss", id: c.id })).toBe(
      "dismiss"
    );
    const dismissed = await memory.listDismissals(hana);
    expect(dismissed.has({ kind: "commitment", recordId: c.id })).toBe(true);

    // A promise that is not there.
    expect(
      await runAction(hana, {
        action: "done",
        id: "0b9c1a52-9f5f-4b9a-8a52-6a1f0b2c3d4e",
      })
    ).toBe("gone");
  });

  it("snoozes a reminder for an hour, or moves it a day on at the same time, from its buttons (D43)", async () => {
    const { runAction } = await import("./telegram-actions");
    const self = await memory.ensureSelf(hana, "Я");
    const now = new Date("2026-11-12T12:00:00Z");
    const first = new Date(now.getTime() - 60_000);
    const make = (text: string) =>
      memory.addRecord(hana, {
        dueAt: new Date("2026-11-12T00:00:00Z"),
        entities: [{ entityId: self.id, role: "debtor" }],
        kind: "commitment",
        remindAt: first,
        text,
      });
    const [a, b] = await Promise.all([
      make("Напоминание: час"),
      make("Напоминание: завтра"),
    ]);
    if (!(a && b)) {
      throw new Error("no records");
    }
    // Both were told: a reminder claimed is not due again until it is moved.
    expect(await memory.claimReminder(hana, a.id)).toBe(true);
    expect(await memory.claimReminder(hana, a.id)).toBe(false);
    expect(await memory.claimReminder(hana, b.id)).toBe(true);

    expect(await runAction(hana, { action: "snooze", id: a.id }, now)).toBe(
      "snooze"
    );
    const [snoozed] = await memory.listRecords(hana, { ids: [a.id] });
    expect(snoozed?.remindAt?.toISOString()).toBe("2026-11-12T13:00:00.000Z");
    expect(snoozed?.remindedAt).toBeNull();

    expect(await runAction(hana, { action: "tomorrow", id: b.id }, now)).toBe(
      "tomorrow"
    );
    const [moved] = await memory.listRecords(hana, { ids: [b.id] });
    // A day on from the moment it was due to go off (it was past): tomorrow, at the time of the press.
    expect(moved?.remindAt?.toISOString()).toBe("2026-11-13T12:00:00.000Z");
    expect(moved?.remindedAt).toBeNull();
    const due = await memory.dueReminders(new Date("2026-11-13T12:30:00Z"));
    const mine = due.filter((r) => r.ownerId === hana).map((r) => r.id);
    expect(mine).toHaveLength(2);
    expect(mine).toEqual(expect.arrayContaining([a.id, b.id]));

    // Not a promise of theirs: nothing to snooze.
    expect(await runAction(bob, { action: "snooze", id: a.id }, now)).toBe(
      "gone"
    );
  });

  it("keeps a reminder still to go off when the text is corrected, and does not bring back one that went off", async () => {
    const self = await memory.ensureSelf(hana, "Я");
    const at = new Date("2026-11-20T07:00:00Z");
    const make = (text: string) =>
      memory.addRecord(hana, {
        dueAt: new Date("2026-11-19T21:00:00Z"),
        entities: [{ entityId: self.id, role: "debtor" }],
        kind: "commitment",
        remindAt: at,
        text,
      });
    const [ahead, told] = await Promise.all([
      make("Поправка: ещё не сработало"),
      make("Поправка: уже сработало"),
    ]);
    if (!(ahead && told)) {
      throw new Error("no records");
    }
    expect(await memory.claimReminder(hana, told.id)).toBe(true);
    const [one, two] = await Promise.all([
      memory.correctRecord(
        hana,
        ahead.id,
        "Поправка: ещё не сработало, новый текст"
      ),
      memory.correctRecord(
        hana,
        told.id,
        "Поправка: уже сработало, новый текст"
      ),
    ]);
    const [a] = await memory.listRecords(hana, { ids: [one?.id as string] });
    const [b] = await memory.listRecords(hana, { ids: [two?.id as string] });
    expect(a?.remindAt?.toISOString()).toBe(at.toISOString());
    expect(a?.remindedAt).toBeNull();
    expect(b?.remindAt).toBeNull();
  });

  it("merges two cards into one and takes it back as it was (ARCH §19.8.5)", async () => {
    const today: typeof MemoryTodayModule = await import("./memory-today");
    const team = await memory.createEntity(gwen, {
      kind: "group",
      name: "Моя команда",
    });
    const lena = await memory.createEntity(gwen, {
      kind: "person",
      name: "Лена",
    });
    const kotova = await memory.createEntity(gwen, {
      kind: "person",
      name: "Лена Котова",
      role: "аналитик",
    });
    const self = await memory.ensureSelf(gwen, "Я");
    const join = (who: string) =>
      memory.addRecord(gwen, {
        entities: [
          { entityId: who, role: "about" },
          { entityId: team.id, role: "group" },
        ],
        kind: "fact",
        text: "В моей команде",
      });
    await join(lena.id);
    await join(kotova.id);
    const promise = await memory.addRecord(gwen, {
      entities: owes(lena.id, self.id),
      kind: "commitment",
      text: "Лена пришлёт отчёт",
    });
    // Both on one meeting: after the merge the card is there once.
    const meeting = await memory.addRecord(gwen, {
      entities: [
        { entityId: lena.id, role: "participant" },
        { entityId: kotova.id, role: "participant" },
      ],
      kind: "event",
      occurred: { at: new Date(), precision: "day" },
      text: "Созвон с Леной",
    });
    const rule = await memory.addRecord(gwen, {
      entities: [{ entityId: team.id, role: "subject" }],
      kind: "rule",
      rule: { days: 14, kind: "rhythm", workingDays: false },
      text: "Один на один с каждым из моей команды раз в две недели",
    });
    const later = new Date(Date.now() + 15 * 86_400_000);
    const due = async () => {
      const list = await today.todaySuggestions(gwen, "Europe/Moscow", later);
      return list
        .filter((s) => s.id === rule.id)
        .map((s) => s.who?.name)
        .toSorted();
    };
    const links = async (id: string) => {
      const [r] = await memory.listRecords(gwen, { ids: [id] });
      return r?.entities.map((e) => e.entityId).toSorted();
    };
    // Two cards for one person: the team's rule counts her twice.
    expect(await due()).toEqual(["Лена", "Лена Котова"]);
    const offered = await memory.mergeSuggestions(gwen);
    expect(offered.map((p) => `${p.keep.name} ← ${p.gone.name}`)).toEqual([
      "Лена Котова ← Лена",
    ]);

    // Not with a card of another kind, not with the person's own, not with itself.
    expect(await memory.mergeEntities(gwen, kotova.id, team.id)).toBeNull();
    expect(await memory.mergeEntities(gwen, self.id, lena.id)).toBeNull();
    expect(await memory.mergeEntities(gwen, lena.id, lena.id)).toBeNull();

    // Contacts: put in by hand; the card kept takes the phone it lacks, keeps its own address.
    await memory.updateEntity(gwen, kotova.id, {
      email: "kotova@example.test",
    });
    await memory.updateEntity(gwen, lena.id, {
      email: "lena@example.test",
      phone: "+7 900 000-00-00",
    });
    const before = await memory.listEntities(gwen);
    expect(before.find((c) => c.id === lena.id)).toMatchObject({
      email: "lena@example.test",
      phone: "+7 900 000-00-00",
    });

    // A thing of the person's own kind (D42): kind `custom`, the kind's word on the card, changed by hand.
    const bus = await memory.createEntity(gwen, {
      kind: "custom",
      name: "Автобус 412",
      type: " автобус ",
    });
    expect(bus).toMatchObject({ kind: "custom", type: "автобус" });
    await memory.updateEntity(gwen, bus.id, { type: "маршрутка" });
    const things = await memory.listEntities(gwen);
    expect(things.find((c) => c.id === bus.id)).toMatchObject({
      type: "маршрутка",
    });
    // The other kinds carry no type, whatever is given.
    const other = await memory.createEntity(gwen, {
      kind: "person",
      name: "Игорь Тестовый",
      type: "автобус",
    });
    expect(other.type).toBeNull();

    const merge = await memory.mergeEntities(gwen, kotova.id, lena.id);
    expect(merge).not.toBeNull();
    const cards = await memory.listEntities(gwen);
    expect(cards.find((c) => c.id === kotova.id)).toMatchObject({
      email: "kotova@example.test",
      phone: "+7 900 000-00-00",
    });
    expect(cards.map((c) => c.name)).not.toContain("Лена");
    expect(cards.find((c) => c.id === kotova.id)?.aliases).toEqual(["Лена"]);
    expect(await links(promise.id)).toEqual([kotova.id, self.id].toSorted());
    expect(await links(meeting.id)).toEqual([kotova.id]);
    // The group has her once; «Убрать» of her rhythm row followed her.
    const facts = await memory.listRecords(gwen, { kinds: ["fact"] });
    const { groupMembers } = await import("./memory-groups");
    expect([...(groupMembers(facts).get(team.id) ?? [])]).toEqual([kotova.id]);
    expect(await due()).toEqual(["Лена Котова"]);
    // A write that still names the merged card lands on the one left.
    const after = await memory.addRecord(gwen, {
      entities: [{ entityId: lena.id, role: "about" }],
      kind: "fact",
      text: "Любит короткие письма",
    });
    expect(await links(after.id)).toEqual([kotova.id]);
    expect(await memory.mergeSuggestions(gwen)).toEqual([]);

    // «Вернуть»: both cards as they were; what came after stays with the one it went to.
    expect(await memory.undoMerge(gwen, merge?.id as string)).toBe(true);
    expect(await memory.undoMerge(gwen, merge?.id as string)).toBe(false);
    const back = await memory.listEntities(gwen);
    expect(back.map((c) => c.name)).toContain("Лена");
    expect(back.find((c) => c.id === kotova.id)?.aliases).toEqual([]);
    expect(back.find((c) => c.id === kotova.id)).toMatchObject({
      email: "kotova@example.test",
      phone: null,
    });
    expect(await links(promise.id)).toEqual([lena.id, self.id].toSorted());
    expect(await links(meeting.id)).toEqual([kotova.id, lena.id].toSorted());
    expect(await links(after.id)).toEqual([kotova.id]);
    expect(await due()).toEqual(["Лена", "Лена Котова"]);

    // «Убрать» of her rhythm row follows her into the card left, and back.
    await memory.dismissSuggestion(gwen, rule.id, {
      entityId: lena.id,
      since: null,
    });
    const second = await memory.mergeEntities(gwen, kotova.id, lena.id);
    const moved = await memory.listDismissals(gwen);
    const rhythm = (entityId: string) =>
      ({ entityId, kind: "rhythm", recordId: rule.id }) as const;
    expect(moved.has(rhythm(kotova.id))).toBe(true);
    expect(moved.has(rhythm(lena.id))).toBe(false);
    expect(await memory.undoMerge(gwen, second?.id as string)).toBe(true);
    const back2 = await memory.listDismissals(gwen);
    expect(back2.has(rhythm(lena.id))).toBe(true);
    expect(back2.has(rhythm(kotova.id))).toBe(false);

    // «Разные»: the pair is not offered again.
    await memory.dismissMergePair(gwen, lena.id, kotova.id);
    expect(await memory.mergeSuggestions(gwen)).toEqual([]);
  });

  it("forgets everything, key included, and starts over with a new one", async () => {
    await memory.forgetAll(bob);
    expect(await memory.listRecords(bob)).toEqual([]);
    const card = await memory.createEntity(bob, {
      kind: "person",
      name: "Новый",
    });
    const record = await memory.addRecord(bob, {
      entities: [{ entityId: card.id, role: "about" }],
      kind: "fact",
      text: "После «Забыть всё»",
    });
    expect(await recordIds(bob)).toEqual([record.id]);
    await memory.forgetAll(bob);
    expect(await memory.listEntities(bob)).toEqual([]);
  });

  // Last: it changes SECRETS_KEY for the rest of the process.
  it("does not seal with a key another process has forgotten", async () => {
    await memory.addRecord(bob, { entities: [], kind: "fact", text: "до" });
    // «Забыть всё» in the web, and a new key there; this process (the worker) still holds the old one.
    await db.delete(memoryRecords).where(eq(memoryRecords.ownerId, bob));
    await db.delete(memoryKeys).where(eq(memoryKeys.ownerId, bob));
    await memory.addRecord(bob, { entities: [], kind: "fact", text: "после" });
    // Another process reads it with the key in the table.
    (globalThis as Record<symbol, Map<string, unknown>>)[
      Symbol.for("metobe.memory.keys")
    ]?.clear();
    expect(await recordTexts(bob)).toEqual(["после"]);
  });

  it("survives a SECRETS_KEY rotation: only the data keys are sealed again", async () => {
    const record = await memory.addRecord(ana, {
      entities: [],
      kind: "fact",
      text: "Пережить ротацию ключа",
    });
    const stored = async () => {
      const [key] = await db
        .select()
        .from(memoryKeys)
        .where(eq(memoryKeys.ownerId, ana));
      const [text] = await db
        .select({ sealed: memoryRecords.sealed })
        .from(memoryRecords)
        .where(eq(memoryRecords.id, record.id));
      return { keyId: key?.keyId, sealed: text?.sealed };
    };
    const before = await stored();

    process.env.SECRETS_KEY_PREVIOUS = process.env.SECRETS_KEY;
    process.env.SECRETS_KEY = randomBytes(32).toString("base64");
    vi.resetModules();
    // The unsealed keys of the process go too: the next read opens them from the table again.
    (globalThis as Record<symbol, Map<string, unknown>>)[
      Symbol.for("metobe.memory.keys")
    ]?.clear();
    const { rotateSecrets } = await import("./secrets");
    const fresh = await import("./memory");

    // Still readable with the previous key standing by, before and after the rotation.
    const opened = await fresh.listRecords(ana);
    expect(opened.map((r) => r.text)).toContain("Пережить ротацию ключа");
    const { rotated } = await rotateSecrets();
    expect(rotated).toBeGreaterThan(0);
    (globalThis as Record<symbol, Map<string, unknown>>)[
      Symbol.for("metobe.memory.keys")
    ]?.clear();
    delete process.env.SECRETS_KEY_PREVIOUS;
    vi.resetModules();
    const alone = await import("./memory");
    const reopened = await alone.listRecords(ana);
    expect(reopened.map((r) => r.text)).toContain("Пережить ротацию ключа");

    const after = await stored();
    expect(after.keyId).not.toBe(before.keyId);
    expect(after.sealed).toBe(before.sealed);
  });
});
