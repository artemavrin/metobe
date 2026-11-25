// Development only (Г1.5, short): does the chat answer from a memory it already has? A throwaway user in the dev
// database gets a small memory — namesakes, promises both ways, closed and overdue ones, a stage that changed, events
// over three months, a rule — and fourteen questions go the chat's own way: TIME_NOTE, STYLE_NOTE, MEMORY_NOTE, the
// <memory> block in front of the message, the time tool and the memory's tools. Each answer is checked by code (`has`
// — every pattern found in the answer or in what `show_*` put on screen, `not` — none), no judge model. Printed per question: the outcome, the tools called, the input
// tokens, the cost; then the share right per kind, the memory tools per answer, the block's size and the total cost.
// The user is removed at the end; nobody else's rows are touched.
//
//   cd apps/cli && npx tsx --conditions=react-server --env-file=../../.env dev/memory-read-eval.ts
//   MODEL=… RUNS=2 ONLY=time … — the model by its id among the installation's models (enabled or not), runs per
//   question, one kind only
//
// Cost on meta/muse-ember ($0.1 / $0.5 per million): about $0.02 a run of fourteen.

import { getLanguageModel } from "@metobe/core/ai";
import { reportedCostOf } from "@metobe/core/chat-run";
import { STYLE_NOTE } from "@metobe/core/chat-tools/answer-style";
import {
  TIME_NOTE,
  TIME_TOOL,
  timeTool,
} from "@metobe/core/chat-tools/time-tool";
import { getDb } from "@metobe/core/db";
import { addRecord, createEntity, ensureSelf } from "@metobe/core/memory";
import {
  MEMORY_TOOLS,
  memoryBrief,
  memoryShowTools,
  memoryTools,
} from "@metobe/core/memory-read";
import { MEMORY_NOTE } from "@metobe/core/memory-write";
import { testMember } from "@metobe/core/test-organization";
import { user } from "@metobe/db/schema/auth";
import { generateText, stepCountIs } from "ai";

const TIME_ZONE = "Europe/Moscow";
const { MODEL = "meta/muse-ember", ONLY, RUNS: RUNS_SET } = process.env;
const RUNS = Number(RUNS_SET ?? 1);

const DAY = 86_400_000;
const at = (days: number) => new Date(Date.now() + days * DAY);
const MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];
/** «8 ноября», «08.11», «2026-11-08» — a day as an answer may say it. */
const dayPattern = (d: Date) => {
  const [y, m, dd] = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE })
    .format(d)
    .split("-");
  const n = Number(dd);
  return new RegExp(
    `(?:\\b${n}\\s+${MONTHS[Number(m) - 1]}|\\b${dd}\\.${m}|${y}-${m}-${dd})`,
    "iu"
  );
};

/** The store's words, as `memory-voice-check` counts them. */
const STORE =
  /по памяти|в памяти|из памяти|запис(?:ь|и|ей|ям|ях)(?![а-яё])|обязательств|карточк/iu;
const BIRTHDAY =
  /(?:родил|рождени)[^.\n]{0,30}\b\d{1,2}\s+(?:январ|феврал|март|апрел|ма[яй]|июн|июл|август|сентябр|октябр|ноябр|декабр)/iu;

type Kind = "extract" | "multi" | "update" | "time" | "unknown" | "standing";

interface Question {
  kind: Kind;
  say: string;
  has: RegExp[];
  not?: RegExp[];
}

const LAST_CALL = at(-6);
const QUESTIONS: Question[] = [
  {
    has: [/Котов/iu],
    kind: "extract",
    say: "Кто главный бухгалтер в «Векторе»?",
  },
  { has: [/заместител/iu], kind: "extract", say: "Кем у меня работает Ирина?" },
  {
    has: [/договор/iu, /акт/iu],
    kind: "multi",
    say: "Что мне должны люди из «Вектора»?",
  },
  {
    has: [/Седов/iu, /Ланьшин/iu],
    kind: "multi",
    say: "Что у меня с Андреем?",
  },
  {
    has: [/тестировани/iu],
    kind: "update",
    not: [/(?:сейчас|ещё|пока)[^.]{0,20}разработк/iu],
    say: "На каком этапе «Склад 2.0»?",
  },
  {
    has: [/договор/iu, /сч[её]т|сканер/iu],
    kind: "time",
    say: "Что у меня просрочено?",
  },
  {
    has: [dayPattern(LAST_CALL)],
    kind: "time",
    say: "Когда я последний раз говорил с Седовым?",
  },
  {
    has: [],
    kind: "unknown",
    // A day said as his birthday; other days (when he sent a mock-up) may be said.
    not: [BIRTHDAY, STORE],
    say: "Когда день рождения у Ланьшина?",
  },
  {
    has: [],
    kind: "unknown",
    not: [/@|\+7|\b8\s?\(?9\d\d/u, STORE],
    say: "Какой телефон у Гурова?",
  },
  // What the standing block is for: answered with no tool once it is there.
  {
    has: [/договор/iu],
    kind: "standing",
    say: "Что мне обещала Ольга?",
  },
  {
    has: [/договор/iu, /сч[её]т|сканер/iu],
    kind: "standing",
    say: "Что у меня горит?",
  },
  {
    has: [/смет/iu, /сч[её]т|сканер/iu],
    kind: "standing",
    say: "Что я сам обещал и ещё не сделал?",
  },
  // No name in it: today the block is empty.
  { has: [/смет/iu], kind: "standing", say: "Что у меня на завтра?" },
  // A rule with no period: how the user wants things done, only a tool away today.
  {
    has: [/Ирин|Белов/iu],
    kind: "standing",
    say: "Набросай письмо Ольге: пусть пришлёт подписанный договор",
  },
];

const about = (...ids: string[]) =>
  ids.map((entityId) => ({ entityId, role: "about" as const }));

/** A small memory with the traps of the full set: namesakes, both sides, a closed promise, a replaced stage. */
const seed = async (owner: string) => {
  const self = await ensureSelf(owner, "Проверка чтения");
  const card = async (
    name: string,
    kind: "person" | "org" | "project",
    role?: string
  ) => {
    const made = await createEntity(owner, { kind, name, role });
    return made.id;
  };
  const vector = await card("ООО «Вектор»", "org", "клиент");
  const olga = await card("Ольга Ли", "person", "юрист «Вектора»");
  const kotova = await card(
    "Марина Котова",
    "person",
    "главный бухгалтер «Вектора»"
  );
  const sedov = await card("Андрей Седов", "person", "поставщик оборудования");
  const lanshin = await card("Андрей Ланьшин", "person", "дизайнер");
  const irina = await card("Ирина Белова", "person", "заместитель");
  const gurov = await card("Павел Гуров", "person", "юрист «Атласа»");
  const atlas = await card("ООО «Атлас»", "org", "партнёр");
  const sklad = await card("«Склад 2.0»", "project", "внедрение WMS");
  const portal = await card("Портал 2.0", "project", "клиентский портал");
  const orlov = await card("Денис Орлов", "person", "аналитик");
  const kim = await card("Светлана Ким", "person", "HR");

  const owes = (debtor: string, creditor: string, ...more: string[]) => [
    { entityId: debtor, role: "debtor" as const },
    { entityId: creditor, role: "creditor" as const },
    ...about(...more),
  ];
  const facts: [string[], string, number?, number?][] = [
    [[self.id], "Руковожу отделом внедрения"],
    [[kotova, vector], "Марина Котова — главный бухгалтер «Вектора»"],
    [[olga, vector], "Ольга ведёт договоры «Вектора»"],
    [[sklad], "«Склад 2.0» на этапе разработки", -60, -12],
    [[sklad], "«Склад 2.0» в тестировании", -12],
    [[sklad, vector], "«Склад 2.0» делаем для «Вектора»"],
    [[portal, irina], "Ирина ведёт вторую версию портала"],
    [[sedov], "Седов поставляет сканеры и терминалы"],
    [[lanshin, portal], "Ланьшин рисует макеты портала"],
    [[gurov, atlas], "Гуров отвечает за договоры «Атласа»"],
    [[orlov], "Орлов считает экономику проектов"],
    [[kim], "Ким ищет второго аналитика"],
  ];
  for (const [ids, text, from, to] of facts) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- a few rows, in order
    await addRecord(owner, {
      entities: about(...ids),
      kind: "fact",
      text,
      validFrom: from === undefined ? undefined : at(from),
      validTo: to === undefined ? undefined : at(to),
    });
  }
  await addRecord(owner, {
    entities: about(self.id),
    kind: "rule",
    text: "В письма клиентам всегда ставлю в копию Ирину Белову",
  });
  const promises: [
    ReturnType<typeof owes>,
    string,
    number | null,
    { status?: "done"; important?: boolean }?,
  ][] = [
    [
      owes(olga, self.id, vector),
      "Прислать подписанный договор",
      -3,
      { important: true },
    ],
    [owes(kotova, self.id, vector), "Прислать акт сверки за октябрь", 2],
    [owes(self.id, olga, sklad), "Отправить смету по складу", 1],
    [owes(self.id, sedov), "Оплатить счёт за сканеры", -1],
    [owes(sedov, self.id, sklad), "Привезти сканеры на склад", 12],
    [owes(irina, self.id, portal), "Подготовить отчёт по внедрению", 5],
    [
      owes(self.id, irina, portal),
      "Протестировать вторую версию портала",
      null,
    ],
    [
      owes(gurov, self.id, atlas),
      "Вернуть подписанное NDA",
      -20,
      { status: "done" },
    ],
    [owes(lanshin, self.id, portal), "Нарисовать макет главной", 30],
    [owes(orlov, self.id, sklad), "Посчитать окупаемость склада", 9],
  ];
  for (const [entities, text, due, extra] of promises) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- a few rows, in order
    await addRecord(owner, {
      dueAt: due === null ? undefined : at(due),
      entities,
      givenAt: at(-25),
      important: extra?.important,
      kind: "commitment",
      status: extra?.status,
      text,
    });
  }
  const events: [string[], string, number][] = [
    [[sedov, sklad], "Созвонились с Андреем Седовым о поставке сканеров", -6],
    [[sedov], "Встреча с Седовым на складе", -40],
    [[olga, vector], "Встреча с Ольгой по договору", -2],
    [[kotova], "Котова прислала счёт за сентябрь", -30],
    [[irina, portal], "Ирина показала первую версию портала", -15],
    [[lanshin, portal], "Ланьшин прислал два варианта макета", -9],
    [[gurov, atlas], "Подписали NDA с «Атласом»", -20],
    [[orlov, sklad], "Орлов показал расчёт по складу", -50],
    [[kim], "Собеседование аналитика вместе с Ким", -4],
    [[vector], "Квартальная встреча с «Вектором»", -80],
  ];
  for (const [ids, text, day] of events) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- a few rows, in order
    await addRecord(owner, {
      entities: about(...ids),
      kind: "event",
      occurred: { at: at(day), precision: "day" },
      text,
    });
  }
};

const { db, sql } = getDb();
const [row] = await sql<
  { source_id: string }[]
>`select source_id from models where model_id = ${MODEL} limit 1`;
if (!row) {
  throw new Error(`no model ${MODEL} in this installation`);
}
const model = await getLanguageModel(row.source_id, MODEL);
const owner = `read-eval-${crypto.randomUUID().slice(0, 8)}`;

interface Outcome {
  kind: Kind;
  ok: boolean;
  /** Calls of the reading tools; `show_*` put a list on screen, as the chat should, and are counted apart. */
  reads: number;
  shows: number;
  /** Every tool call, the time tool too. */
  calls: number;
  input: number;
  cost: number;
  brief: number;
}
const outcomes: Outcome[] = [];

try {
  const member = await testMember(db);
  await db.insert(user).values({
    ...member,
    email: `${owner}@example.test`,
    id: owner,
    name: "Проверка чтения",
    timeZone: TIME_ZONE,
  });
  await seed(owner);
  const tools = {
    [TIME_TOOL]: timeTool(TIME_ZONE),
    ...memoryTools(owner, TIME_ZONE),
    ...memoryShowTools(owner, TIME_ZONE),
  };
  const asked = QUESTIONS.filter((q) => !ONLY || q.kind === ONLY);
  for (let run = 0; run < RUNS; run += 1) {
    for (const q of asked) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one question at a time, for a readable log
      const brief = await memoryBrief(owner, q.say, TIME_ZONE);
      // oxlint-disable-next-line eslint/no-await-in-loop -- one question at a time, for a readable log
      const result = await generateText({
        instructions: [TIME_NOTE, STYLE_NOTE, MEMORY_NOTE].join("\n\n"),
        messages: [
          {
            content: [
              ...(brief ? [{ text: brief, type: "text" as const }] : []),
              { text: q.say, type: "text" as const },
            ],
            role: "user",
          },
        ],
        model,
        providerOptions: { gateway: { zeroDataRetention: true } },
        stopWhen: stepCountIs(6),
        tools,
      });
      const answer = result.text.trim();
      const called = result.steps.flatMap((s) =>
        s.toolCalls.map((c) => c.toolName)
      );
      // What `show_*` put on screen is part of the answer the person sees: the model is told not to repeat it.
      const shown = result.steps
        .flatMap((s) => s.toolResults)
        .filter((r) => r.toolName.startsWith("show_"))
        .map((r) => JSON.stringify(r.output))
        .join("\n");
      const seen = `${answer}\n${shown}`;
      const wrong = [
        ...q.has.flatMap((re) => (re.test(seen) ? [] : [`no ${re}`])),
        ...(q.not ?? []).flatMap((re) => {
          const found = re.exec(answer);
          return found ? [`«${found[0]}»`] : [];
        }),
      ];
      const outcome: Outcome = {
        brief: brief.length,
        calls: called.length,
        cost: Number(
          reportedCostOf(result.steps.map((s) => s.providerMetadata)) ?? 0
        ),
        input: result.totalUsage.inputTokens ?? 0,
        kind: q.kind,
        ok: wrong.length === 0,
        reads: called.filter((n) => MEMORY_TOOLS.includes(n)).length,
        shows: called.filter((n) => n.startsWith("show_")).length,
      };
      outcomes.push(outcome);
      console.log(`\n[${q.kind}] > ${q.say}`);
      console.log(answer.replaceAll(/\n+/gu, "\n  "));
      console.log(
        `  ${outcome.ok ? "✓" : `✗ ${wrong.join(", ")}`} · tools: ${called.join(", ") || "—"} · in ${outcome.input} · $${outcome.cost.toFixed(4)}`
      );
    }
  }

  const kinds = [...new Set(outcomes.map((o) => o.kind))];
  console.log(`\n${MODEL}, ${RUNS} run(s):`);
  for (const kind of kinds) {
    const of = outcomes.filter((o) => o.kind === kind);
    const per = (f: (o: Outcome) => number) =>
      (of.reduce((s, o) => s + f(o), 0) / of.length).toFixed(1);
    console.log(
      `  ${kind.padEnd(9)} ${of.filter((o) => o.ok).length}/${of.length} right · reads ${per((o) => o.reads)} · shows ${per((o) => o.shows)} · all tools ${per((o) => o.calls)} per answer`
    );
  }
  const n = outcomes.length;
  const sum = (f: (o: Outcome) => number) =>
    outcomes.reduce((s, o) => s + f(o), 0);
  console.log(
    `  all       ${outcomes.filter((o) => o.ok).length}/${n} right · reads ${(sum((o) => o.reads) / n).toFixed(2)} · shows ${(sum((o) => o.shows) / n).toFixed(2)} · all tools ${(sum((o) => o.calls) / n).toFixed(2)} per answer · input ${Math.round(sum((o) => o.input) / n)} tokens per answer · block ~${Math.round(sum((o) => o.brief) / n / 4)} tokens · $${sum((o) => o.cost).toFixed(4)}`
  );
} finally {
  await sql`delete from "user" where id = ${owner}`;
  await sql.end();
  process.exit();
}
