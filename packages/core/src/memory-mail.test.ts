import { describe, expect, it } from "vitest";

import type { MailEnvelope } from "./mailboxes";
import {
  baseSubject,
  cardAddresses,
  waitedPast,
  waitingLetters,
} from "./memory-mail";
import type { MailCard } from "./memory-mail";

const ME = "me@company.example";
const OLGA = "olga@vendor.example";
const ANDREY = "andrey@vendor.example";

let uid = 0;
const letter = (over: Partial<MailEnvelope>): MailEnvelope => {
  uid += 1;
  return {
    auto: false,
    cc: [],
    date: "2026-11-02T10:00:00.000Z",
    folder: "INBOX",
    from: [OLGA],
    inReplyTo: null,
    messageId: `<m${uid}@mail.example>`,
    names: {},
    references: [],
    subject: "Договор поставки",
    to: [ME],
    uid,
    ...over,
  };
};

const sent = (over: Partial<MailEnvelope>) =>
  letter({
    date: "2026-11-06T09:00:00.000Z",
    folder: "Sent",
    from: [ME],
    to: [OLGA],
    ...over,
  });

/** Olga wrote to the box before: she is someone who answers here. */
const earlier = letter({ subject: "Знакомство" });

const wait = (envelopes: MailEnvelope[], cards = new Map([[OLGA, "olga"]])) =>
  waitingLetters({
    address: ME,
    cards,
    envelopes,
    sentFolder: "Sent",
    since: new Date("2026-10-15T00:00:00Z"),
  });

describe("which sent letters wait for an answer (Г3.1)", () => {
  it("waits on a letter to a card's address with nothing back", () => {
    const s = sent({ messageId: "<a@me>" });
    expect(wait([earlier, s])).toEqual([
      {
        entityId: "olga",
        messageId: "<a@me>",
        references: ["<a@me>"],
        sentAt: new Date("2026-11-06T09:00:00.000Z"),
        subject: "Договор поставки",
        to: OLGA,
      },
    ]);
  });

  it("is answered by a letter that refers to it, whoever sent it and in any folder", () => {
    const s = sent({ messageId: "<a@me>" });
    const reply = letter({
      date: "2026-11-07T09:00:00.000Z",
      folder: "Trash",
      from: [ANDREY],
      inReplyTo: "<a@me>",
      subject: "Другая тема",
    });
    expect(wait([earlier, s, reply])).toEqual([]);
  });

  it("is answered by a later letter from whom it went to, with the same subject, without the headers", () => {
    const s = sent({ messageId: "<a@me>" });
    const reply = letter({
      date: "2026-11-07T09:00:00.000Z",
      subject: "RE: Договор   поставки",
    });
    expect(wait([earlier, s, reply])).toEqual([]);
    const before = letter({ date: "2026-11-05T09:00:00.000Z" });
    expect(wait([earlier, s, before])).toHaveLength(1);
  });

  it("is not answered by an autoreply", () => {
    const s = sent({ messageId: "<a@me>" });
    const away = letter({
      auto: true,
      date: "2026-11-06T09:01:00.000Z",
      inReplyTo: "<a@me>",
    });
    expect(wait([earlier, s, away])).toHaveLength(1);
  });

  it("does not wait on a forward, a reply, or a letter to many", () => {
    expect(wait([earlier, sent({ subject: "Fwd: Договор" })])).toEqual([]);
    expect(wait([earlier, sent({ inReplyTo: "<x@vendor>" })])).toEqual([]);
    expect(
      wait([
        earlier,
        sent({ cc: ["a@x.example", "b@x.example"], to: [OLGA, ANDREY] }),
      ])
    ).toEqual([]);
  });

  it("waits on the card among several people, three at most", () => {
    const s = sent({ cc: [ANDREY], to: ["boss@x.example", OLGA] });
    expect(wait([earlier, s])).toMatchObject([{ entityId: "olga", to: OLGA }]);
  });

  it("does not wait on someone who never wrote to this box, or who is not a card", () => {
    expect(wait([sent({})])).toEqual([]);
    expect(wait([earlier, sent({})], new Map())).toEqual([]);
  });

  it("counts from the person's last letter in the thread", () => {
    const s = sent({ messageId: "<a@me>" });
    const again = sent({
      date: "2026-11-12T09:00:00.000Z",
      inReplyTo: "<a@me>",
      references: ["<a@me>"],
      subject: "Re: Договор поставки",
    });
    expect(wait([earlier, s, again])).toMatchObject([
      { sentAt: new Date("2026-11-12T09:00:00.000Z") },
    ]);
  });

  it("keeps a letter seen in two folders once, and none sent before the window", () => {
    const s = sent({ messageId: "<a@me>" });
    expect(wait([earlier, s, { ...s, folder: "All Mail" }])).toHaveLength(1);
    expect(wait([earlier, sent({ date: "2026-09-01T09:00:00Z" })])).toEqual([]);
  });

  it("strips replies and forwards off a subject", () => {
    expect(baseSubject("Re: Fwd: [Склад]  Договор")).toBe("[склад] договор");
    expect(baseSubject("Ответ: Счёт")).toBe("счёт");
  });
});

describe("how long it has waited", () => {
  // 2026-11-06 is a Friday.
  it("counts five working days when no rule says", () => {
    expect(waitedPast("2026-11-06", "2026-11-12")).toBeNull();
    expect(waitedPast("2026-11-06", "2026-11-13")).toBe(5);
  });

  it("takes the card's rule over the five days, in calendar days when it says so", () => {
    expect(
      waitedPast("2026-11-06", "2026-11-09", { days: 3, workingDays: false })
    ).toBe(3);
    expect(
      waitedPast("2026-11-06", "2026-11-09", { days: 3, workingDays: true })
    ).toBeNull();
  });
});

const card = (id: string, name: string, over: Partial<MailCard> = {}) => ({
  aliases: [],
  email: null,
  id,
  kind: "person",
  name,
  ...over,
});

describe("whose address it is", () => {
  it("takes the address on the card, and a full name the letters give an address to", () => {
    const found = cardAddresses(
      [
        card("olga", "Ольга Ли"),
        card("andrey", "Андрей Седов", { email: "Andrey@Vendor.example" }),
        card("me", "Я", { email: "me@company.example", kind: "self" }),
      ],
      [
        letter({ names: { [OLGA]: "Ли Ольга" } }),
        sent({ names: { [ANDREY]: "Андрей" } }),
      ]
    );
    expect([...found]).toEqual([
      [ANDREY, "andrey"],
      [OLGA, "olga"],
    ]);
  });

  it("does not guess by a first name, a name two cards share, or an address two names share", () => {
    expect(
      cardAddresses(
        [card("olga", "Ольга")],
        [letter({ names: { [OLGA]: "Ольга" } })]
      ).size
    ).toBe(0);
    expect(
      cardAddresses(
        [card("a", "Андрей Седов"), card("b", "Седов Андрей")],
        [letter({ names: { [ANDREY]: "Андрей Седов" } })]
      ).size
    ).toBe(0);
    expect(
      cardAddresses(
        [card("olga", "Ольга Ли"), card("ira", "Ирина Ким")],
        [
          letter({ names: { "team@vendor.example": "Ольга Ли" } }),
          letter({ names: { "team@vendor.example": "Ирина Ким" } }),
        ]
      ).size
    ).toBe(0);
  });

  it("goes by an alias, and leaves an organization alone", () => {
    expect([
      ...cardAddresses(
        [
          card("olga", "Ольга", { aliases: ["Ольга Ли"] }),
          card("vendor", "Вектор Плюс", { kind: "org" }),
        ],
        [
          letter({ names: { [OLGA]: "Ольга Ли" } }),
          letter({ names: { "info@vector.example": "Вектор Плюс" } }),
        ]
      ),
    ]).toEqual([[OLGA, "olga"]]);
  });
});
