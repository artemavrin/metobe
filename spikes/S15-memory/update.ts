// S15 part 3 «обновление» (ARCH §19.9.3, MEMORY-PLAN §3.6): a message replaces an old fact or event, moves a promise's
// deadline, or only adds. 26 messages on the 300-card memory, with the facts, events and promises of the S13 cards
// the cases are about. The model is shown what the writer shows it — the picked cards and promises and `candidateKnown`
// — and its answer is judged as `planWrite` takes it, so a replacement the code refuses does not count.
// Gateway only.
//
//   DRY=1 pnpm run update          # no model: what is shown, and how big the block of known facts and events is
//   pnpm run update                # Gemini 3.5 Flash, reasoning low — about $0.17 for 26 messages
//   ONLY=3,7 SHOW=1 pnpm run update   # only these cases (by number), with what the model answered
//   NOKNOWN=1 pnpm run update      # as before §19.9.3: no block, no rule — what the block costs in tokens

import { createGateway } from "@ai-sdk/gateway";
import { generateText, Output } from "ai";

import type { MemoryEntity, MemoryRecord } from "../../packages/core/src/memory.ts";
import { candidateCards, candidateCommitments, candidateKnown } from "../../packages/core/src/memory-candidates.ts";
import {
  extractionSchema,
  localMidnight,
  memoryInstructions,
  memoryPrompt,
  planWrite,
} from "../../packages/core/src/memory-extract.ts";
import type { KnownCard, OpenCommitment } from "../../packages/core/src/memory-extract.ts";
import { caseId, isMain, type EvalCase } from "../S13-jev/eval-case.ts";
import { TIMEZONE } from "../S13-jev/extract-cases.ts";
import { sourceKey } from "../S13-jev/keys.ts";
import { NOW, SELF, fillerCards, fillerPromises } from "./memory300.ts";

const MODEL = process.env.MODEL ?? "google/gemini-3.5-flash";
const DRY = Boolean(process.env.DRY);
const NOKNOWN = Boolean(process.env.NOKNOWN);
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",").map(Number)) : null;
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 4);

// --- the memory -----------------------------------------------------------------------------------------------------

const day = (d: string) => localMidnight(d, TIMEZONE) as Date;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const card = (id: string, kind: MemoryEntity["kind"], name: string, role: string | null): MemoryEntity => ({
  aliases: [],
  createdAt: daysAgo(120),
  id,
  kind,
  name,
  role,
  updatedAt: daysAgo(120),
});

const base: MemoryEntity[] = [
  card("sklad", "project", "«Склад 2.0»", "новая складская система"),
  card("andrey_smirnov", "person", "Андрей Смирнов", "разработчик бэкенда"),
  card("marina_orlova", "person", "Марина Орлова", "дизайнер"),
  card("igor_belov", "person", "Игорь Белов", "руководитель отдела продаж"),
  card("vector", "org", "ООО «Вектор»", "поставщик оборудования"),
  card("olga_li", "person", "Ольга Ли", "менеджер в «Альфа-Логистике»"),
  card("svetlana_petrova", "person", "Светлана Петрова", "главный бухгалтер"),
  card("andrey_kovalev", "person", "Андрей Ковалёв", "менеджер по закупкам в «Векторе»"),
];

const filler = fillerCards();
const team: MemoryEntity = { ...(filler[0] as MemoryEntity), id: "team", kind: "group", name: "Моя команда", role: null };
const entities = [SELF, ...base, team, ...filler];

const record = (id: string, over: Partial<MemoryRecord> & Pick<MemoryRecord, "kind" | "text">): MemoryRecord => ({
  closedByWrite: null,
  deletedAt: null,
  doneAt: null,
  dueAt: null,
  entities: [],
  givenAt: null,
  id,
  important: false,
  occurredAt: null,
  occurredPrecision: null,
  recordedAt: daysAgo(20),
  role: null,
  rule: null,
  status: null,
  supersededAt: null,
  supersededBy: null,
  validFrom: null,
  validTo: null,
  writeId: null,
  ...over,
});
const about = (...ids: string[]) => ids.map((entityId) => ({ entityId, role: "about" as const }));
const fact = (id: string, who: string, text: string, since: string) =>
  record(id, { entities: about(who), kind: "fact", text, validFrom: day(since) });
const event = (id: string, who: string, text: string, on: string) =>
  record(id, {
    entities: [{ entityId: who, role: "participant" }],
    kind: "event",
    occurredAt: day(on),
    occurredPrecision: "day",
    // A coming event was put in lately, so its card is among the last two weeks' (a card the text does not name).
    recordedAt: daysAgo(3),
    text,
  });
const owed = (id: string, debtor: string, creditor: string, text: string, due: string) =>
  record(id, {
    dueAt: day(due),
    entities: [
      { entityId: debtor, role: "debtor" },
      { entityId: creditor, role: "creditor" },
    ],
    givenAt: daysAgo(5),
    kind: "commitment",
    status: "open",
    text,
  });

const known = [
  fact("F_STAGE", "sklad", "«Склад 2.0» на этапе разработки", "2026-10-02"),
  fact("F_ANDREY", "andrey_smirnov", "Андрей Смирнов — разработчик бэкенда", "2025-03-01"),
  fact("F_IGOR", "igor_belov", "Игорь Белов — руководитель отдела продаж", "2024-01-15"),
  fact("F_SVET", "svetlana_petrova", "Светлана Петрова — главный бухгалтер", "2023-06-01"),
  fact("F_MARINA", "marina_orlova", "Марина Орлова предпочитает общаться в мессенджере", "2026-09-10"),
  fact("F_OLGA", "olga_li", "Ольга Ли — менеджер в «Альфа-Логистике»", "2025-11-01"),
  fact("F_VECTOR", "vector", "ООО «Вектор» — поставщик оборудования", "2024-05-01"),
  fact("F_KOVALEV", "andrey_kovalev", "Андрей Ковалёв — менеджер по закупкам в «Векторе»", "2025-08-01"),
  event("E_VECTOR", "vector", "Встреча с ООО «Вектор» в среду", "2026-11-11"),
  event("E_OLGA", "olga_li", "Созвон с Ольгой Ли во вторник", "2026-11-10"),
  event("E_PLAN", "sklad", "Планёрка по «Складу 2.0» в пятницу", "2026-11-13"),
  event("E_ONE", "andrey_smirnov", "Встреча один на один с Андреем Смирновым в четверг", "2026-11-12"),
  event("E_PRES", "marina_orlova", "Презентация для клиента в пятницу", "2026-11-13"),
  owed("K_OLGA", "olga_li", "user", "Ольга Ли пришлёт подписанный договор к пятнице, 13 ноября", "2026-11-13"),
  owed("K_API", "andrey_smirnov", "user", "Андрей Смирнов закончит API для «Склада 2.0» к 13 ноября", "2026-11-13"),
  owed("K_REPORT", "user", "igor_belov", "Отправить Игорю Белову отчёт к среде, 11 ноября", "2026-11-11"),
  owed("K_MAKET", "marina_orlova", "user", "Марина Орлова подготовит макеты к 16 ноября", "2026-11-16"),
];
const records = [...known, ...fillerPromises(filler)];

// --- the cases ------------------------------------------------------------------------------------------------------

type Expect =
  /** A new fact about `who` that replaces `old`. */
  | { replaceFact: string; who: string }
  /** A new event that replaces `old`, on that day or cancelled. */
  | { replaceEvent: string; day?: string; cancelled?: true }
  /** The deadline of `old` moved to that day, and no new promise. */
  | { moveDue: string; day: string }
  /** Something recorded, and nothing replaced. */
  | { beside: true }
  /** Nothing replaced and no deadline moved. */
  | { none: true };

const cases: { text: string; expect: Expect; group: string }[] = [
  { expect: { replaceFact: "F_STAGE", who: "sklad" }, group: "fact", text: "«Склад 2.0» перешёл в тестирование" },
  { expect: { replaceFact: "F_ANDREY", who: "andrey_smirnov" }, group: "fact", text: "Андрея Смирнова назначили тимлидом бэкенда" },
  { expect: { replaceFact: "F_IGOR", who: "igor_belov" }, group: "fact", text: "Игорь Белов перешёл в «Вектор» коммерческим директором" },
  { expect: { replaceFact: "F_SVET", who: "svetlana_petrova" }, group: "fact", text: "Светлана Петрова теперь финансовый директор" },
  { expect: { replaceFact: "F_MARINA", who: "marina_orlova" }, group: "fact", text: "Марина теперь предпочитает звонки, а не мессенджер" },
  { expect: { replaceFact: "F_OLGA", who: "olga_li" }, group: "fact", text: "Ольга Ли сменила работу — теперь она в «Стреле»" },
  { expect: { day: "2026-11-12", replaceEvent: "E_VECTOR" }, group: "moved", text: "Встречу с «Вектором» перенесли на четверг" },
  { expect: { day: "2026-11-11", replaceEvent: "E_OLGA" }, group: "moved", text: "Созвон с Ольгой переносится на среду" },
  { expect: { day: "2026-11-16", replaceEvent: "E_PLAN" }, group: "moved", text: "Планёрку по складу сдвинули на понедельник" },
  { expect: { day: "2026-11-13", replaceEvent: "E_ONE" }, group: "moved", text: "Один на один с Андреем Смирновым теперь в пятницу" },
  { expect: { day: "2026-11-12", replaceEvent: "E_PRES" }, group: "moved", text: "Презентация для клиента будет не в пятницу, а в четверг" },
  { expect: { cancelled: true, replaceEvent: "E_VECTOR" }, group: "cancelled", text: "Встречу с «Вектором» отменили" },
  { expect: { cancelled: true, replaceEvent: "E_PLAN" }, group: "cancelled", text: "Планёрки по складу в пятницу не будет" },
  { expect: { day: "2026-11-16", moveDue: "K_OLGA" }, group: "due", text: "Ольга Ли пришлёт договор не к пятнице, а к понедельнику" },
  { expect: { day: "2026-11-17", moveDue: "K_API" }, group: "due", text: "Андрей Смирнов сдвинул API на 17 ноября" },
  { expect: { day: "2026-11-12", moveDue: "K_REPORT" }, group: "due", text: "Отчёт для Игоря Белова нужен не к среде, а к четвергу" },
  { expect: { day: "2026-11-20", moveDue: "K_MAKET" }, group: "due", text: "Макеты от Марины теперь к 20 ноября" },
  { expect: { beside: true }, group: "beside", text: "Андрей Смирнов ещё ведёт код-ревью в команде" },
  { expect: { beside: true }, group: "beside", text: "У «Склада 2.0» появился второй заказчик" },
  { expect: { beside: true }, group: "beside", text: "Игорь Белов любит, когда отчёты приходят утром" },
  { expect: { beside: true }, group: "beside", text: "Ещё одна встреча с «Вектором» — в пятницу" },
  { expect: { none: true }, group: "other", text: "посчитай 15% от 240 тысяч" },
  { expect: { none: true }, group: "other", text: "Объясни, чем отличается индекс от первичного ключа" },
  { expect: { none: true }, group: "other", text: "Составь план встречи с «Вектором» на среду" },
  { expect: { day: "2026-11-11", replaceEvent: "E_OLGA" }, group: "correction", text: "Не во вторник, а в среду созвон с Ольгой" },
  { expect: { day: "2026-11-12", replaceEvent: "E_PLAN" }, group: "correction", text: "Планёрка по складу не в пятницу, а в четверг" },
];

// --- what the model is shown, and the verdict -----------------------------------------------------------------------

type Out = (typeof extractionSchema)["_output"];

const shown = (text: string, withKnown: boolean) => {
  const found = candidateCards({ entities, now: NOW, records, text });
  const open = candidateCommitments({ cards: found, now: NOW, records, selfId: SELF.id, text });
  const knownRecords = withKnown ? candidateKnown({ cards: found, entities, now: NOW, records, selfId: SELF.id }) : [];
  const cardsShown: KnownCard[] = found.map((e) => ({
    aliases: e.aliases,
    id: e.id,
    kind: e.kind as KnownCard["kind"],
    name: e.name,
    ref: e.id,
    role: e.role,
  }));
  const commitments: OpenCommitment[] = open.map((r) => ({
    due: r.dueAt,
    id: r.id,
    ref: r.id,
    status: r.status === "unconfirmed" ? "unconfirmed" : "open",
    text: r.text,
  }));
  return { cards: cardsShown, commitments, knownRecords };
};

const judge = (c: (typeof cases)[number], out: Out, s: ReturnType<typeof shown>) => {
  const plan = planWrite(out, {
    cards: s.cards,
    commitments: s.commitments,
    knownRecords: s.knownRecords,
    selfId: SELF.id,
    timeZone: TIMEZONE,
  });
  const e = c.expect;
  const wanted = "replaceFact" in e ? e.replaceFact : "replaceEvent" in e ? e.replaceEvent : null;
  const replacing = plan.records.filter((r) => r.replaces);
  // A replacement the code let through that is not the one wanted: the one that would damage a memory.
  const wrong = replacing.filter((r) => r.replaces !== wanted);
  const misses: string[] = wrong.map((r) => `WRONG replaces ${r.replaces} with «${r.text}»`);
  let needed: 0 | 1 = 0;
  let done: 0 | 1 = 0;
  let moved: 0 | 1 = 0;
  let movedOk: 0 | 1 = 0;
  const raw = out.items.filter((i) => i.replaces && i.replaces !== "none").length;
  if ("replaceFact" in e) {
    needed = 1;
    const hit = plan.records.some(
      (r) => r.kind === "fact" && r.replaces === e.replaceFact && r.entities.some((l) => "entityId" in l && l.entityId === e.who)
    );
    if (hit) done = 1;
    else misses.push(`no fact about ${e.who} replacing ${e.replaceFact}`);
  } else if ("replaceEvent" in e) {
    needed = 1;
    const hit = plan.records.find((r) => r.kind === "event" && r.replaces === e.replaceEvent);
    if (!hit) misses.push(`no event replacing ${e.replaceEvent}`);
    else if (e.cancelled && !/отмен/iu.test(hit.text)) misses.push(`not said cancelled: «${hit.text}»`);
    else if (e.day && hit.occurred?.at.getTime() !== day(e.day).getTime()) misses.push(`on ${hit.occurred?.at.toISOString()}, want ${e.day}`);
    else done = 1;
  } else if ("moveDue" in e) {
    moved = 1;
    const m = plan.dues.find((d) => d.recordId === e.moveDue);
    const fresh = plan.records.filter((r) => r.kind === "commitment");
    if (!m) misses.push(`deadline of ${e.moveDue} not moved`);
    else if (m.dueAt.getTime() !== day(e.day).getTime()) misses.push(`moved to ${m.dueAt.toISOString()}, want ${e.day}`);
    else if (fresh.length > 0) misses.push(`new promise too: «${fresh[0]?.text}»`);
    else movedOk = 1;
  } else if ("beside" in e) {
    if (plan.records.length === 0) misses.push("nothing recorded");
  } else if (plan.dues.length > 0) {
    misses.push("moved a deadline where none was said");
  }
  return { done, misses, moved, movedOk, needed, raw, refused: raw - replacing.length, wrong: wrong.length };
};

// --- run ------------------------------------------------------------------------------------------------------------

const pct = (a: number, b: number) => (b === 0 ? "—" : `${a}/${b} (${Math.round((100 * a) / b)} %)`);

const pool = async <T,>(items: T[], size: number, run: (item: T) => Promise<void>) => {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: size }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) await run(item);
    })
  );
};

/**
 * The cases for `pnpm memory:eval`. `known: false` — as before §19.9.3, with no block of current facts and events:
 * then no replacement can be made, and the set shows only what the block costs.
 */
export const evalCases = ({ known: withKnown = true }: { known?: boolean } = {}): EvalCase[] =>
  cases.map((c, i) => {
    const s = shown(c.text, withKnown);
    return {
      id: caseId(i),
      instructions: memoryInstructions({ cards: s.cards, commitments: s.commitments, known: s.knownRecords, sentAt: NOW, timeZone: TIMEZONE }),
      kind: "write",
      prompt: memoryPrompt(c.text, []),
      score: (o) => {
        const v = judge(c, o, s);
        return {
          miss: v.misses.length > 0 ? v.misses.join("; ") : null,
          tally: { moved: [v.movedOk, v.moved], no_wrong_replace: [v.wrong === 0 ? 1 : 0, 1], replaced: [v.done, v.needed] },
        };
      },
      text: c.text,
    };
  });

// The run below is `pnpm run update`. Imported — by eval.ts — the file only gives its cases.
if (isMain(import.meta.url)) {
  const KEY = DRY ? "" : sourceKey("gateway").key;
  const gw = DRY ? null : createGateway({ apiKey: KEY });
  const credits = async () => {
    if (!KEY) return null;
    try {
      const r = await fetch("https://ai-gateway.vercel.sh/v1/credits", { headers: { Authorization: `Bearer ${KEY}` } });
      return Number(((await r.json()) as { total_used?: string | number }).total_used);
    } catch {
      return null;
    }
  };

  const picked = cases.map((c, i) => ({ c, i: i + 1 })).filter(({ i }) => !ONLY || ONLY.has(i));
  const sizes = picked.map(({ c }) => {
    const s = shown(c.text, !NOKNOWN);
    const inst = memoryInstructions({ cards: s.cards, commitments: s.commitments, known: s.knownRecords, sentAt: NOW, timeZone: TIMEZONE });
    const bare = memoryInstructions({ cards: s.cards, commitments: s.commitments, sentAt: NOW, timeZone: TIMEZONE });
    return { bare: bare.length, chars: inst.length, facts: s.knownRecords.filter((k) => k.kind === "fact").length, events: s.knownRecords.filter((k) => k.kind === "event").length, s };
  });
  const med = (xs: number[]) => xs.toSorted((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
  console.log(
    JSON.stringify({
      block_chars_p50: med(sizes.map((x) => x.chars - x.bare)),
      cases: picked.length,
      events_max: Math.max(...sizes.map((x) => x.events)),
      facts_max: Math.max(...sizes.map((x) => x.facts)),
      known_none: sizes.filter((x) => x.facts + x.events === 0).length,
      mode: NOKNOWN ? "no block" : "with block",
    })
  );
  // What the pick has to hold: the old record each case is about.
  for (const [n, { c, i }] of picked.entries()) {
    const e = c.expect;
    const old = "replaceFact" in e ? e.replaceFact : "replaceEvent" in e ? e.replaceEvent : "moveDue" in e ? e.moveDue : null;
    const s = (sizes[n] as (typeof sizes)[number]).s;
    const held = !old || s.knownRecords.some((k) => k.id === old) || s.commitments.some((k) => k.id === old);
    if (!held) console.log(`  ✗ ${i}. pick lost ${old}: ${c.text}`);
  }
  if (DRY || !gw) process.exit(0);

  const before = await credits();
  const tally = { done: 0, moved: 0, movedOk: 0, needed: 0, raw: 0, refused: 0, wrong: 0 };
  const tokens: number[] = [];
  let cost = 0;
  await pool(picked, CONCURRENCY, async ({ c, i }) => {
    const s = (sizes[picked.findIndex((p) => p.i === i)] as (typeof sizes)[number]).s;
    try {
      const r = await generateText({
        instructions: memoryInstructions({ cards: s.cards, commitments: s.commitments, known: s.knownRecords, sentAt: NOW, timeZone: TIMEZONE }),
        maxRetries: 2,
        model: gw(MODEL),
        output: Output.object({ schema: extractionSchema }),
        prompt: memoryPrompt(c.text, []),
        providerOptions: { gateway: { zeroDataRetention: true } },
        reasoning: "low",
      });
      tokens.push(r.usage.inputTokens ?? 0);
      cost += Number((r.providerMetadata?.gateway as { cost?: string } | undefined)?.cost ?? 0);
      const v = judge(c, r.output, s);
      for (const k of Object.keys(tally) as (keyof typeof tally)[]) tally[k] += v[k];
      if (v.misses.length > 0) {
        console.log(`  ✗ ${i}. ${c.text} → ${v.misses.join("; ")}`);
        if (process.env.SHOW)
          console.log(`      ${JSON.stringify({ items: r.output.items.map((x) => [x.kind, x.text, x.about, x.replaces]), moves: r.output.moves })}`);
      }
    } catch (error) {
      console.log(`  ! ${i}. ${c.text}: ${(error as Error).message.slice(0, 160)}`);
    }
  });
  const after = await credits();
  const sorted = tokens.toSorted((a, b) => a - b);
  console.log(
    JSON.stringify({
      balance_used: before !== null && after !== null ? `$${(after - before).toFixed(4)}` : "n/a",
      cost_per_msg: `$${(cost / Math.max(1, tokens.length)).toFixed(4)}`,
      deadlines_moved: pct(tally.movedOk, tally.moved),
      input_tokens_max: sorted.at(-1),
      input_tokens_p50: med(tokens),
      model: MODEL,
      refused_by_code: tally.refused,
      replacements_needed_done: pct(tally.done, tally.needed),
      replacements_wrong: tally.wrong,
    })
  );
}
