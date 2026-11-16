// S15 part «даты» (ARCH §19.8.7, В2.3): a message names a day that comes again — a birthday, a payment day, a weekday
// of every week — and the writer makes a `date` rule of it, standing on its day; a message that only names a date does
// not. 16 messages on the S13 cards, the model shown what the writer shows it (the prompt's rule on days that come
// again only for a message `repeatsDate` finds), its answer judged as `planWrite` takes it. Gateway only.
//
//   DRY=1 pnpm run dates      # no model: which messages get the rule in the prompt
//   pnpm run dates            # meta/muse-ember — about $0.01 for 16 messages
//   SHOW=1 pnpm run dates     # with what the model answered for each miss

import { createGateway } from "@ai-sdk/gateway";
import { generateText, Output } from "ai";

import type { MemoryEntity } from "../../packages/core/src/memory.ts";
import {
  extractionSchema,
  memoryInstructions,
  memoryPrompt,
  planWrite,
  repeatsDate,
} from "../../packages/core/src/memory-extract.ts";
import type { KnownCard } from "../../packages/core/src/memory-extract.ts";
import { TIMEZONE } from "../S13-jev/extract-cases.ts";
import { sourceKey } from "../S13-jev/keys.ts";
import { NOW, SELF } from "./memory300.ts";

const MODEL = process.env.MODEL ?? "meta/muse-ember";
const DRY = Boolean(process.env.DRY);

const card = (id: string, kind: MemoryEntity["kind"], name: string, role: string | null): MemoryEntity => ({
  aliases: [],
  createdAt: NOW,
  email: null,
  id,
  kind,
  name,
  phone: null,
  role,
  type: null,
  updatedAt: NOW,
});
const cards = [
  card("sklad", "project", "«Склад 2.0»", "новая складская система"),
  card("andrey_smirnov", "person", "Андрей Смирнов", "разработчик бэкенда"),
  card("marina_orlova", "person", "Марина Орлова", "дизайнер"),
  card("igor_belov", "person", "Игорь Белов", "руководитель отдела продаж"),
  card("olga_li", "person", "Ольга Ли", "менеджер в «Альфа-Логистике»"),
  card("svetlana_petrova", "person", "Светлана Петрова", "главный бухгалтер"),
];

/** What a case wants: a date rule — how it repeats, about whom, on which day of the year, month or week — or none. */
type Want =
  | { repeat: "year"; who: string; month: number; day: number }
  | { repeat: "month"; day: number }
  | { repeat: "week"; weekday: number }
  | { none: true };

const cases: { text: string; want: Want }[] = [
  { text: "У Ольги Ли день рождения 14 ноября", want: { day: 14, month: 11, repeat: "year", who: "olga_li" } },
  { text: "Игорь Белов родился 3 марта, запомни", want: { day: 3, month: 3, repeat: "year", who: "igor_belov" } },
  { text: "У Марины день рождения 8 июля", want: { day: 8, month: 7, repeat: "year", who: "marina_orlova" } },
  {
    text: "Светлана Петрова работает у нас с 1 сентября 2019, каждый год отмечаем годовщину",
    want: { day: 1, month: 9, repeat: "year", who: "svetlana_petrova" },
  },
  { text: "Аренду офиса платим двадцатого числа каждого месяца", want: { day: 20, repeat: "month" } },
  { text: "Отчёт для бухгалтерии сдаём каждого пятнадцатого числа", want: { day: 15, repeat: "month" } },
  { text: "Отчёт по продажам нужен каждую пятницу", want: { repeat: "week", weekday: 5 } },
  { text: "Каждый понедельник у нас планёрка по складу", want: { repeat: "week", weekday: 1 } },
  { text: "Встретился с Ольгой Ли 14 ноября", want: { none: true } },
  { text: "Андрей Смирнов уходит в отпуск 20 ноября", want: { none: true } },
  { text: "Ольга Ли обещала прислать договор к пятнице", want: { none: true } },
  { text: "Совещание по складу в понедельник в 10:00", want: { none: true } },
  { text: "В прошлую пятницу мы подписали акт с Игорем Беловым", want: { none: true } },
  { text: "Каждый раз, когда звоню Игорю Белову, он занят", want: { none: true } },
  { text: "У Марины был день рождения на прошлой неделе, я её поздравил", want: { none: true } },
  { text: "«Склад 2.0» перешёл на этап тестирования", want: { none: true } },
];

const shown: KnownCard[] = cards.map((e) => ({
  aliases: e.aliases,
  id: e.id,
  kind: e.kind as KnownCard["kind"],
  name: e.name,
  ref: e.id,
  role: e.role,
}));
const instructions = (text: string) =>
  memoryInstructions({ cards: shown, repeating: repeatsDate(text), sentAt: NOW, timeZone: TIMEZONE });

type Out = (typeof extractionSchema)["_output"];

const judge = (c: (typeof cases)[number], out: Out) => {
  const plan = planWrite(out, { cards: shown, commitments: [], selfId: SELF.id, timeZone: TIMEZONE });
  const rules = plan.records.filter((r) => r.rule?.kind === "date");
  const w = c.want;
  if ("none" in w) return rules.length === 0 ? null : `a date rule where none was said: «${rules[0]?.text}»`;
  const hit = rules.find((r) => {
    if (r.rule?.repeat !== w.repeat || !r.occurred) return false;
    // A Moscow midnight, three hours on, is that day in UTC.
    const at = new Date(r.occurred.at.getTime() + 3 * 3600_000);
    if (w.repeat === "year") {
      return (
        at.getUTCMonth() + 1 === w.month &&
        at.getUTCDate() === w.day &&
        r.entities.some((l) => "entityId" in l && l.entityId === w.who)
      );
    }
    return w.repeat === "month" ? at.getUTCDate() === w.day : at.getUTCDay() === w.weekday;
  });
  return hit
    ? null
    : `no ${w.repeat} date rule as wanted; rules: ${JSON.stringify(rules.map((r) => [r.text, r.rule?.repeat, r.occurred?.at.toISOString()]))}`;
};

if (DRY) {
  for (const [i, c] of cases.entries()) {
    console.log(`${i + 1}. ${repeatsDate(c.text) ? "rule in prompt" : "no rule      "} ${"none" in c.want ? "(none wanted)" : ""} ${c.text}`);
  }
  const missed = cases.filter((c) => !("none" in c.want) && !repeatsDate(c.text));
  console.log(`positive cases the prompt does not offer the rule to: ${missed.length}`);
  process.exit(0);
}

const KEY = sourceKey("gateway").key;
const gw = createGateway({ apiKey: KEY });
const credits = async () => {
  try {
    const r = await fetch("https://ai-gateway.vercel.sh/v1/credits", { headers: { Authorization: `Bearer ${KEY}` } });
    return Number(((await r.json()) as { total_used?: string | number }).total_used);
  } catch {
    return null;
  }
};
const before = await credits();
let right = 0;
let positives = 0;
let positivesRight = 0;
let negatives = 0;
let negativesRight = 0;
await Promise.all(
  cases.map(async (c, i) => {
    try {
      const r = await generateText({
        instructions: instructions(c.text),
        maxRetries: 2,
        model: gw(MODEL),
        output: Output.object({ schema: extractionSchema }),
        prompt: memoryPrompt(c.text, []),
        providerOptions: { gateway: { zeroDataRetention: true } },
        reasoning: "low",
      });
      const miss = judge(c, r.output);
      const positive = !("none" in c.want);
      if (positive) positives += 1;
      else negatives += 1;
      if (miss) {
        console.log(`  ✗ ${i + 1}. ${c.text} → ${miss}`);
        if (process.env.SHOW) {
          console.log(`      ${JSON.stringify(r.output.items.map((x) => [x.kind, x.text, x.rule_kind, x.repeat, x.when]))}`);
        }
      } else {
        right += 1;
        if (positive) positivesRight += 1;
        else negativesRight += 1;
      }
    } catch (error) {
      console.log(`  ! ${i + 1}. ${c.text}: ${(error as Error).message.slice(0, 160)}`);
    }
  })
);
const after = await credits();
console.log(
  JSON.stringify({
    balance_used: before !== null && after !== null ? `$${(after - before).toFixed(4)}` : "n/a",
    model: MODEL,
    no_rule_where_none: `${negativesRight}/${negatives}`,
    rule_where_said: `${positivesRight}/${positives}`,
    total: `${right}/${cases.length}`,
  })
);
