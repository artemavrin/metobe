import { randomBytes } from "node:crypto";

import type { Db } from "@metobe/db/client";
import { runMigrations } from "@metobe/db/migrate";
import { user } from "@metobe/db/schema/auth";
import { chats, messages } from "@metobe/db/schema/chat";
import { memoryKeys, memoryRecords } from "@metobe/db/schema/memory";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type * as MemoryModule from "./memory";
import type * as MemoryPageModule from "./memory-page";
import type * as MemoryReadModule from "./memory-read";

vi.mock("server-only", () => ({}));

// Needs a database of its own: MEMORY_TEST_DATABASE_URL=postgres://… pnpm --filter @metobe/core test memory.test
// (an empty one is fine — the migrations are applied). It creates its own users and removes them at the end, so any
// database works, and nothing else in it is touched.
const URL = process.env.MEMORY_TEST_DATABASE_URL;

describe.skipIf(!URL)("memory store (ARCH §19)", () => {
  let memory: typeof MemoryModule;
  let db: Db;
  const ana = `memory-test-${randomBytes(4).toString("hex")}`;
  const bob = `memory-test-${randomBytes(4).toString("hex")}`;
  /** The «Память» page's owner: a memory of its own, so the counts are exact. */
  const cleo = `memory-test-${randomBytes(4).toString("hex")}`;

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
    await runMigrations(URL as string);
    const dbModule = await import("./db");
    ({ db } = dbModule.getDb());
    memory = await import("./memory");
    await db.insert(user).values(
      [ana, bob, cleo].map((id) => ({
        email: `${id}@example.test`,
        id,
        name: id,
      }))
    );
  });

  afterAll(async () => {
    await db?.delete(user).where(inArray(user.id, [ana, bob, cleo]));
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
      const made = await memory.createWrite(ana, {
        chatId,
        messageId: crypto.randomUUID(),
      });
      return made.id;
    };

    it("takes one message once", async () => {
      const messageId = crypto.randomUUID();
      const first = await memory.createWrite(ana, { chatId, messageId });
      const again = await memory.createWrite(ana, { chatId, messageId });
      expect(first.created).toBe(true);
      expect(again).toMatchObject({ created: false, id: first.id });
    });

    it("keeps the memory when the chat goes", async () => {
      const [chat] = await db
        .insert(chats)
        .values({ title: "to delete", userId: ana })
        .returning({ id: chats.id });
      const made = await memory.createWrite(ana, {
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
      const made = await memory.createWrite(ana, {
        chatId,
        messageId: crypto.randomUUID(),
      });
      expect(
        await memory.applyWrite(ana, made.id, {
          drafts: [],
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

    it("puts in a whole message at once, and only once", async () => {
      const made = await memory.createWrite(ana, {
        chatId,
        messageId: crypto.randomUUID(),
      });
      const known = await memory.createEntity(ana, {
        kind: "person",
        name: "Ольга Ли",
      });
      const plan: MemoryModule.MemoryWritePlan = {
        drafts: [],
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
      const again = await memory.createWrite(ana, {
        chatId,
        messageId: crypto.randomUUID(),
      });
      expect(
        await memory.applyWrite(ana, again.id, {
          drafts: [],
          entities: [],
          records: [],
          statuses: [],
        })
      ).toBe(true);
      const skipped = await memory.createWrite(ana, {
        chatId,
        messageId: crypto.randomUUID(),
      });
      expect(skipped.status).toBe("queued");
    });

    it("forgets what deleted messages put in, and reads them afresh", async () => {
      const messageId = crypto.randomUUID();
      const made = await memory.createWrite(ana, { chatId, messageId });
      await memory.applyWrite(ana, made.id, {
        drafts: [],
        entities: [],
        records: [
          { entities: [], kind: "fact", text: "Из удалённого сообщения" },
        ],
        statuses: [],
      });
      await memory.forgetMessages(ana, [messageId, crypto.randomUUID()]);
      expect(await recordTexts(ana)).not.toContain("Из удалённого сообщения");
      const anew = await memory.createWrite(ana, { chatId, messageId });
      expect(anew.created).toBe(true);
    });

    /** A write with one question: «Какой Андрей?» between two new cards. */
    const ask = async () => {
      const made = await memory.createWrite(ana, {
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
    const made = await memory.createWrite(cleo, { chatId, messageId });
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

    const overview = await page.memoryOverview(cleo);
    // The person's own card is not in the list.
    expect(overview.cards).toEqual([
      expect.objectContaining({ id: olga.id, open: 2, overdue: 1 }),
    ]);
    expect(overview.rules.map((r) => r.text)).toEqual([
      "Встреча один на один раз в две недели",
    ]);

    const card = await page.memoryCard(cleo, olga.id);
    expect(card?.records).toHaveLength(3);
    expect(card?.records.find((r) => r.id === late.id)).toMatchObject({
      chatId,
      entities: [
        { id: olga.id, kind: "person", name: "Ольга Ли", role: "debtor" },
        { id: self.id, kind: "self", name: "Клео", role: "creditor" },
      ],
      fromChat: true,
    });
    expect(await page.memoryCard(cleo, self.id)).toBeNull();
    expect(await page.memoryCard(bob, olga.id)).toBeNull();

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
    expect(brief).toContain("- Ольга Ли (person; менеджер «Альфа-Логистики»)");
    expect(brief).toContain(
      "commitment: «Ольга Ли пришлёт акт» (Ольга Ли owes the user, due"
    );
    // Closed ones stay out of the block; a message about no one has none.
    expect(brief).not.toContain("прислала счёт");
    expect(await read.memoryBrief(cleo, "посчитай 15%", "UTC")).toBe("");
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
    ).toMatchObject({ commitments: [] });
    const all = (await run(read.LIST_COMMITMENTS, {})) as {
      commitments: string[];
    };
    expect(all.commitments).toHaveLength(1);
    expect(await run(read.MEMORY_CARD, { name: "Ольгу" })).toMatchObject({
      found: true,
      name: "Ольга Ли",
    });
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
