// S15 «300 карточек» (ARCH §19.8.3, D40): the S13 cases — records and dates, «which Андрей», settling promises — on a
// memory of 300 cards and 200 open promises. The model is shown what `candidateCards` and `candidateCommitments` pick,
// as the writer does. Gateway only.
//
//   pnpm many                 # Gemini 3.5 Flash, reasoning low
//   DRY=1 pnpm many           # no model: does the pick hold what each case needs, and how big it is
//   ALL=1 pnpm many           # as before В1.3: every card and the 60 newest open promises
//   PARTS=ask RUNS=2 pnpm many

import { createGateway } from "@ai-sdk/gateway";
import { generateText, Output } from "ai";

import type { MemoryEntity, MemoryRecord } from "../../packages/core/src/memory.ts";
import { candidateCards, candidateCommitments, candidateKnown } from "../../packages/core/src/memory-candidates.ts";
import { extractionSchema, memoryInstructions, memoryPrompt } from "../../packages/core/src/memory-extract.ts";
import type { ChatTurn, KnownCard, OpenCommitment } from "../../packages/core/src/memory-extract.ts";
import { cards as askCards, exchange } from "../S13-jev/cases.ts";
import { TIMEZONE, extractCases, knownCards, type Expect, type When } from "../S13-jev/extract-cases.ts";
import { sourceKey } from "../S13-jev/keys.ts";
import { NOW, SELF, fillerCards, fillerPromises, promise } from "./memory300.ts";

/** FACTS=1: every card's role is a fact that holds, as in a real memory — so the writer is shown the block of known facts (§19.9.3). */
const FACTS = Boolean(process.env.FACTS);

const MODEL = process.env.MODEL ?? "google/gemini-3.5-flash";
const DRY = Boolean(process.env.DRY);
const ALL = Boolean(process.env.ALL);
/** No memory at all: what the instructions and the schema cost by themselves. */
const EMPTY = Boolean(process.env.EMPTY);
const RUNS = Number(process.env.RUNS ?? 1);
const PARTS = (process.env.PARTS ?? "extract,ask,status").split(",");
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 4);
const gw = DRY ? null : createGateway({ apiKey: sourceKey("gateway").key });

type Out = (typeof extractionSchema)["_output"];
type Item = Out["items"][number];

// --- the memory -----------------------------------------------------------------------------------------------------

const filler = fillerCards();
const team: MemoryEntity = { ...(filler[0] as MemoryEntity), id: "team", kind: "group", name: "Моя команда", role: null };
const fillerOpen = fillerPromises(filler);

const card = (id: string, kind: MemoryEntity["kind"], name: string, role: string | null): MemoryEntity => ({
  aliases: [],
  createdAt: NOW,
  id,
  kind,
  name,
  role,
  updatedAt: NOW,
});

interface Memory {
  entities: MemoryEntity[];
  records: MemoryRecord[];
}
const roleFact = (e: MemoryEntity): MemoryRecord => ({
  ...promise(`fact-${e.id}`, `${e.name} — ${e.role}`, e.id, e.id),
  dueAt: null,
  entities: [{ entityId: e.id, role: "about" }],
  givenAt: null,
  kind: "fact",
  status: null,
  validFrom: new Date(NOW.getTime() - 200 * 86_400_000),
});
const memoryOf = (base: MemoryEntity[], promises: MemoryRecord[] = []): Memory => ({
  entities: [SELF, ...base, team, ...filler],
  records: [...promises, ...fillerOpen, ...(FACTS ? base.filter((e) => e.role).map(roleFact) : [])],
});

/** What the model is shown for a message: the pick, or (ALL) everything as before. */
const shown = (memory: Memory, text: string) => {
  const found = EMPTY
    ? []
    : ALL
    ? memory.entities.filter((e) => e.kind !== "self")
    : candidateCards({ entities: memory.entities, now: NOW, records: memory.records, text });
  const open = EMPTY
    ? []
    : ALL
    ? memory.records
        .filter((r) => r.kind === "commitment" && (r.status === "open" || r.status === "unconfirmed"))
        .toSorted((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())
        .slice(0, 60)
    : candidateCommitments({ cards: found, now: NOW, records: memory.records, selfId: SELF.id, text });
  const cards: KnownCard[] = found.map((e) => ({
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
  const known =
    FACTS && !EMPTY
      ? candidateKnown({ cards: found, entities: memory.entities, now: NOW, records: memory.records, selfId: SELF.id })
      : [];
  return { cards, commitments, known };
};

// --- parts ----------------------------------------------------------------------------------------------------------

interface Case {
  text: string;
  context?: ChatTurn[];
  /** Card refs the pick has to hold: one of each group. */
  needs: string[][];
  /** Promise refs the pick has to hold. */
  needsPromises?: string[];
  /** null — right; otherwise what went wrong. Counts go to `tally`. */
  judge: (o: Out) => { miss: string | null; tally?: Record<string, [number, number]> };
}

const KIND_WORD: Record<string, MemoryEntity["kind"]> = { организация: "org", проект: "project", человек: "person" };

// Part 1 — records and dates (S13 part 2, the app's prompt).
const extractPart = (): { memory: Memory; cases: Case[] } => {
  const base = Object.entries(knownCards).map(([id, line]) => {
    const [name = "", rest = ""] = line.split(" — ");
    const [kindWord = "", role = null] = rest.split(": ");
    return card(id, KIND_WORD[kindWord] ?? "person", name, role);
  });
  const dateOk = (want: When, got: Item["when"]) => {
    if (!got) return false;
    if (want.precision === "day") return got.precision === "day" && got.date === want.date;
    if (want.precision === "month") return got.precision === "month" && got.date.slice(0, 7) === want.month;
    return got.precision === "week" && got.date >= want.from && got.date <= want.to;
  };
  const judge = (expect: Expect[]) => (o: Out) => {
    const fresh = new Set(o.new_entities.map((e) => e.id));
    const refOk = (want: string, got: string | null | undefined) =>
      want === "new" ? Boolean(got) && (got?.startsWith("new:") || fresh.has(got as string)) : got === want;
    const matches = (e: Expect, it: Item) => {
      const kinds = [e.kind].flat();
      if (!kinds.includes(it.kind as never)) return false;
      if (e.debtor && ![e.debtor].flat().some((d) => refOk(d, it.debtor))) return false;
      if (e.creditor && !refOk(e.creditor, it.creditor)) return false;
      return !e.about || e.about.every((w) => it.about.some((g) => refOk(w, g)));
    };
    const used = new Set<number>();
    const misses: string[] = [];
    let found = 0;
    let dates = 0;
    let datesOk = 0;
    for (const e of expect) {
      const i = o.items.findIndex((it, j) => !used.has(j) && matches(e, it));
      const checks = [e.when && (["when", e.when] as const), e.due && (["due", e.due] as const)].filter(Boolean) as [
        "when" | "due",
        When,
      ][];
      dates += checks.length + (e.intervalDays ? 1 : 0);
      if (i < 0) {
        misses.push(`missing ${JSON.stringify(e)}`);
        continue;
      }
      used.add(i);
      found += 1;
      const it = o.items[i] as Item;
      for (const [field, want] of checks) {
        if (dateOk(want, it[field])) datesOk += 1;
        else misses.push(`${field}: want ${JSON.stringify(want)}, got ${JSON.stringify(it[field])}`);
      }
      if (e.intervalDays) {
        if (e.intervalDays.includes(it.interval_days ?? -1)) datesOk += 1;
        else misses.push(`interval: got ${it.interval_days}`);
      }
    }
    const extra = o.items.length - used.size;
    if (expect.length === 0 && extra) misses.push(`${extra} items where none were due`);
    return {
      miss: misses.length > 0 ? misses.join("; ") : null,
      tally: {
        dates: [datesOk, dates] as [number, number],
        empty: expect.length === 0 ? ([extra === 0 ? 1 : 0, 1] as [number, number]) : ([0, 0] as [number, number]),
        records: [found, expect.length] as [number, number],
      },
    };
  };
  const refsOf = (e: Expect) =>
    [...(e.about ?? []).map((r) => [r]), [e.debtor ?? []].flat(), [e.creditor ?? ""]]
      .map((g) => g.filter((r) => r && r !== "new" && r !== "user"))
      .filter((g) => g.length > 0);
  return {
    cases: extractCases.map((c) => ({
      judge: judge(c.expect),
      needs: c.expect.flatMap(refsOf),
      text: c.text,
    })),
    memory: memoryOf(base),
  };
};

// Part 2 — ask, not guess (S13 part 4).
const askPart = (): { memory: Memory; cases: Case[] } => {
  const known = {
    ...Object.fromEntries(Object.entries(askCards).filter(([k]) => k !== "new" && k !== "unclear")),
    olga_petrova: "Ольга Петрова — главный бухгалтер",
  };
  const base = Object.entries(known).map(([id, line]) => {
    const [name = "", role = null] = line.split(" — ");
    return card(id, /организация/.test(line) ? "org" : "person", name, role);
  });
  const ANDREYS = ["andrey_smirnov", "andrey_kovalev"];
  const OLGAS = ["olga_li", "olga_petrova"];
  const list: { text: string; expected: string | string[] }[] = [
    { expected: "andrey_kovalev", text: "Андрей из «Вектора» прислал новый прайс." },
    { expected: "andrey_smirnov", text: "Андрей закоммитил исправление в складском API." },
    { expected: "igor_belov", text: "Созвонились с Игорем по плану продаж на декабрь." },
    { expected: "olga_li", text: "Ольга прислала новые тарифы на перевозку." },
    { expected: "new", text: "Наталья из бухгалтерии просит подписать акт." },
    { expected: "andrey_smirnov", text: "Смирнов не успевает с API." },
    { expected: "marina_orlova", text: "Марина нарисовала новые макеты главной страницы." },
    { expected: "andrey_kovalev", text: "Ковалёв просит отсрочку платежа." },
    { expected: "new", text: "Новый разработчик Павел выходит в понедельник." },
    { expected: "andrey_kovalev", text: "Позвонил закупщик от поставщика оборудования, просит подтвердить заказ." },
    { expected: "alfa_logistics", text: "Наш перевозчик снова задержал машину на два дня." },
    { expected: "andrey_smirnov", text: "Андрей обещал закончить API к пятнице." },
    { expected: "olga_petrova", text: "Ольга из бухгалтерии просит подписать акт сверки." },
    { expected: "olga_petrova", text: "Ольга Петрова уходит в отпуск с 20 ноября." },
    { expected: ANDREYS, text: "Андрей завтра в отпуске." },
    { expected: ANDREYS, text: "Андрей просил перезвонить ему после обеда." },
    { expected: ANDREYS, text: "С Андреем договорились встретиться в четверг." },
    { expected: ANDREYS, text: "Андрей прислал документы, посмотрю вечером." },
    { expected: ANDREYS, text: "Андрей заболел, вернётся в понедельник." },
    { expected: OLGAS, text: "Ольга обещала перезвонить завтра." },
    { expected: OLGAS, text: "Ольга в отпуске до конца месяца." },
    { expected: OLGAS, text: "Ольга просила напомнить про встречу." },
  ];
  const verdict = (expected: string | string[]) => (o: Out) => {
    const used = new Set(o.items.flatMap((i) => [...i.about, i.debtor, i.creditor]).filter(Boolean) as string[]);
    const unclear = Array.isArray(expected);
    const say = (miss: string | null) => ({
      miss,
      tally: unclear
        ? { asked: [miss ? 0 : 1, 1] as [number, number] }
        : { clear: [miss ? 0 : 1, 1] as [number, number] },
    });
    if (Array.isArray(expected)) {
      const ask = o.asks.find((a) => expected.every((c) => a.candidates.includes(c)));
      if (!ask) return say(`guessed: refs ${[...used].join(", ")}, asks ${JSON.stringify(o.asks.map((a) => a.candidates))}`);
      if (!used.has(ask.id)) return say(`asked but items do not use ${ask.id}`);
      if (expected.some((c) => used.has(c))) return say("asked and guessed too");
      return say(null);
    }
    if (o.asks.length > 0) return say(`asked needlessly: ${o.asks.map((a) => `${a.question} [${a.candidates}]`).join("; ")}`);
    const fresh = new Set(o.new_entities.map((e) => e.id));
    if (expected === "new") return say([...used].some((r) => fresh.has(r)) ? null : `no new card: refs ${[...used]}`);
    return say(used.has(expected) ? null : `wrong card: refs ${[...used].join(", ")}`);
  };
  return {
    cases: list.map((c) => ({
      judge: verdict(c.expected),
      needs: [c.expected].flat().flatMap((r) => (r === "new" ? [] : [[r]])),
      text: c.text,
    })),
    memory: memoryOf(base),
  };
};

// Part 3 — settling promises (S13 part 6), the S13 promises given 40 days back, among the 200 of the filler.
const day = (iso: string) => new Date(`${iso}T00:00:00+03:00`);
const statusPart = (): { memory: Memory; cases: Case[] } => {
  const base = [
    card("olga", "person", "Ольга Ли", "менеджер «Альфа-Логистики»"),
    card("sedov", "person", "Андрей Седов", "коллега, бэкенд"),
    card("lanshin", "person", "Андрей Ланьшин", "коллега, продажи"),
    card("igor", "person", "Игорь Белов", "бухгалтер"),
  ];
  const promises = [
    promise("k1", "Ольга Ли пришлёт подписанный договор до 13 ноября", "olga", "user", { ago: 40, due: day("2026-11-13") }),
    promise("k2", "Андрей Седов сделает API к 13 ноября", "sedov", "user", { ago: 40, due: day("2026-11-13") }),
    promise("k3", "Позвонить Андрею Седову 10 ноября", "user", "sedov", { ago: 40, due: day("2026-11-10") }),
    promise("k4", "Отправить Игорю Белову акт сверки", "user", "igor", { ago: 40 }),
    promise("k5", "Андрей Ланьшин подготовит презентацию для клиента", "lanshin", "user", { ago: 40, status: "unconfirmed" }),
    promise("k6", "Встреча с Андреем Ланьшиным 11 ноября по скидкам", "user", "lanshin", { ago: 40, due: day("2026-11-11") }),
  ];
  const list: { text: string; updates: string[]; important?: boolean; before?: { user?: string; assistant?: string } }[] = [
    { text: "Ольга прислала подписанный договор", updates: ["k1:done"] },
    { text: "Андрей Седов говорит, что API уже готов", updates: ["k2:unconfirmed"] },
    { text: "Седов показал API, всё работает", updates: ["k2:done"] },
    { text: "звонить Седову не надо, он сам написал", updates: ["k3:cancelled"] },
    { text: "отправил Игорю акт сверки", updates: ["k4:done"] },
    { text: "посмотрел презентацию Ланьшина, отличная", updates: ["k5:done"] },
    { text: "встречу с Ланьшиным по скидкам отменили", updates: ["k6:cancelled"] },
    { text: "Седов говорит, API почти готов, доделает завтра", updates: [] },
    { text: "Ольга обещала прислать договор на этой неделе", updates: [] },
    {
      before: { assistant: "Хорошо, позвонить Андрею Седову 10 ноября.", user: "Андрей Седов просил позвонить ему 10 ноября" },
      text: "Андрей передумал",
      updates: ["k3:cancelled"],
    },
    { important: false, text: "Игорь попросил прислать счёт до пятницы", updates: [] },
    { important: true, text: "Срочно, это горит: до среды отправить Ольге Ли реквизиты", updates: [] },
    { important: true, text: "главное на неделе — подготовить отчёт для Игоря Белова к пятнице", updates: [] },
    { important: false, text: "договорились с Седовым: он поправит баг в выгрузке к понедельнику", updates: [] },
    // Not named: found by the words of the promise (§19.8.3).
    { text: "подписанный договор пришёл, всё в порядке", updates: ["k1:done"] },
  ];
  const verdict = (c: (typeof list)[number]) => (o: Out) => {
    const got = o.updates.map((u) => `${u.ref}:${u.status}`).sort();
    const say = (miss: string | null) => ({ miss, tally: { status: [miss ? 0 : 1, 1] as [number, number] } });
    if (got.join() !== [...c.updates].sort().join()) return say(`updates ${got.join(", ") || "none"}`);
    const fresh = o.items.filter((i) => i.kind === "commitment");
    if (c.important !== undefined) {
      if (fresh.length === 0) return say("no new commitment");
      if (fresh.some((i) => i.important !== c.important)) return say(`important ${fresh.map((i) => i.important).join(",")}`);
    }
    if (c.updates.length > 0 && fresh.length > 0) return say(`new commitment too: ${fresh.map((i) => i.text).join(" / ")}`);
    return say(null);
  };
  return {
    cases: list.map((c) => ({
      context: exchange(c.before),
      judge: verdict(c),
      needs: [],
      needsPromises: c.updates.map((u) => u.split(":")[0] as string),
      text: c.text,
    })),
    memory: memoryOf(base, promises),
  };
};

/** As `planWrite` takes it (`openAsks`): a question with one known card is that card, not a question. */
const asApp = (o: Out, cards: KnownCard[]): Out => {
  const refs = new Set(cards.map((c) => c.ref));
  const one = new Map<string, string>();
  for (const a of o.asks) {
    const known = [...new Set(a.candidates.filter((r) => refs.has(r)))];
    if (known.length === 1) one.set(a.id, known[0] as string);
  }
  const to = (r: string | null) => (r && one.get(r)) ?? r;
  return {
    ...o,
    asks: o.asks.filter((a) => !one.has(a.id)),
    items: o.items.map((i) => ({ ...i, about: i.about.map((r) => to(r) as string), creditor: to(i.creditor), debtor: to(i.debtor) })),
  };
};

// --- run ------------------------------------------------------------------------------------------------------------

const pool = async <T, R>(items: T[], n: number, fn: (item: T) => Promise<R>) => {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i] as T);
      }
    })
  );
  return out;
};

const PART_OF: Record<string, () => { memory: Memory; cases: Case[] }> = {
  ask: askPart,
  extract: extractPart,
  status: statusPart,
};

const pct = ([a, b]: [number, number]) => (b ? `${a}/${b} (${Math.round((100 * a) / b)}%)` : "—");

for (const name of PARTS) {
  const { memory, cases: every } = (PART_OF[name] as () => { memory: Memory; cases: Case[] })();
  // ONLY="a|b": just the cases whose text has one of these — for looking at the ones that failed.
  const only = process.env.ONLY?.split("|");
  const cases = only ? every.filter((c) => only.some((w) => c.text.includes(w))) : every;
  const sizes = cases.map((c) => {
    const said = [c.text, ...(c.context ?? []).map((t) => t.text)].join("\n");
    const s = shown(memory, said);
    const lost = [
      ...c.needs.filter((g) => !s.cards.some((k) => g.includes(k.ref))).map((g) => g.join("|")),
      ...(c.needsPromises ?? []).filter((r) => !s.commitments.some((k) => k.ref === r)),
    ];
    if (lost.length > 0) console.log(`  ✗ pick lost ${lost.join(", ")}: ${c.text}`);
    return { cards: s.cards.length, commitments: s.commitments.length, lost: lost.length, s };
  });
  const most = (f: (x: (typeof sizes)[number]) => number) => Math.max(...sizes.map(f));
  console.log(
    JSON.stringify({
      cards_max: most((x) => x.cards),
      commitments_max: most((x) => x.commitments),
      part: name,
      pick_lost: sizes.reduce((n, x) => n + x.lost, 0),
    })
  );
  if (DRY || !gw) continue;
  const tally: Record<string, [number, number]> = {};
  const tokens: number[] = [];
  let cost = 0;
  const jobs = Array.from({ length: RUNS }, () => cases.map((c, i) => ({ c, i }))).flat();
  await pool(jobs, CONCURRENCY, async ({ c, i }) => {
    const { s } = sizes[i] as (typeof sizes)[number];
    try {
      const r = await generateText({
        instructions: memoryInstructions({ cards: s.cards, commitments: s.commitments, known: s.known, sentAt: NOW, timeZone: TIMEZONE }),
        maxRetries: 2,
        model: gw(MODEL),
        output: Output.object({ schema: extractionSchema }),
        prompt: memoryPrompt(c.text, c.context ?? []),
        providerOptions: { gateway: { zeroDataRetention: true } },
        reasoning: "low",
      });
      tokens.push(r.usage.inputTokens ?? 0);
      cost += Number((r.providerMetadata?.gateway as { cost?: string } | undefined)?.cost ?? 0);
      const v = c.judge(asApp(r.output, s.cards));
      for (const [k, [a, b]] of Object.entries(v.tally ?? {})) {
        const t = tally[k] ?? [0, 0];
        tally[k] = [t[0] + a, t[1] + b];
      }
      if (v.miss) {
        console.log(`  ✗ ${c.text} → ${v.miss}`);
        if (process.env.SHOW) console.log(`      ${JSON.stringify({ asks: r.output.asks, items: r.output.items.map((i) => [i.kind, i.text, i.about, i.debtor, i.creditor]), updates: r.output.updates })}`);
      }
    } catch (error) {
      console.log(`  ! ${c.text}: ${(error as Error).message.slice(0, 160)}`);
    }
  });
  const sorted = tokens.toSorted((a, b) => a - b);
  console.log(
    JSON.stringify({
      cost_per_msg: `$${(cost / Math.max(1, tokens.length)).toFixed(4)}`,
      input_tokens_max: sorted.at(-1),
      input_tokens_p50: sorted[Math.floor(sorted.length / 2)],
      mode: EMPTY ? "empty" : ALL ? "all" : FACTS ? "candidates + known facts" : "candidates",
      model: MODEL,
      part: name,
      ...Object.fromEntries(Object.entries(tally).map(([k, v]) => [k, pct(v)])),
    })
  );
}
