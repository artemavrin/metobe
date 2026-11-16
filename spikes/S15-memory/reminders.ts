// S15 part «напоминания» (D43): a message asks to be reminded — «напомни мне завтра в 15:00 позвонить Ольге» — and the
// writer makes a promise of the user with its day as the deadline and the time of day in `remind`; a message that only
// names a thing to do, or a meeting, does not get one; one to come again («каждый понедельник в 10») gets its repeat. 21
// messages, now is Monday 9 November 2026, 12:00 in Moscow; the
// model is shown what the writer shows it (the rule on reminders only for a message `asksReminder` finds), its answer
// judged as `planWrite` takes it. Gateway only.
//
//   DRY=1 pnpm run reminders      # no model: which messages get the rule in the prompt
//   pnpm run reminders            # meta/muse-ember — about $0.01 for 21 messages
//   SHOW=1 pnpm run reminders     # with what the model answered for each miss

import { createGateway } from "@ai-sdk/gateway";
import { generateText, Output } from "ai";

import type { MemoryEntity } from "../../packages/core/src/memory.ts";
import {
  extractionSchema,
  memoryInstructions,
  memoryPrompt,
  asksReminder,
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

/**
 * What a case wants: a promise of the user with a reminder at this moment (an ISO instant) — coming again as `repeat`
 * says, or once when it says nothing (шаг 6) — or none.
 */
type Want = { at: string; repeat?: "day" | "weekdays" | "week" | "month" | "year" } | { none: true };

// Now is Monday 2026-11-09 12:00 in Moscow (UTC+3).
const cases: { text: string; want: Want }[] = [
  { text: "Напомни мне завтра в 15:00 позвонить Ольге", want: { at: "2026-11-10T12:00:00Z" } },
  { text: "Напомни в пятницу в 10 утра отправить отчёт", want: { at: "2026-11-13T07:00:00Z" } },
  { text: "Напомни мне сегодня в 18:00 забрать посылку", want: { at: "2026-11-09T15:00:00Z" } },
  { text: "Напоминай мне завтра утром про планёрку по складу", want: { at: "2026-11-10T06:00:00Z" } },
  { text: "Напомни через два часа проверить письмо от Вектора", want: { at: "2026-11-09T11:00:00Z" } },
  { text: "Напомни мне в 9 утра позвонить Игорю Белову", want: { at: "2026-11-10T06:00:00Z" } },
  { text: "Напомни мне 15 ноября в 12:30 оплатить счёт", want: { at: "2026-11-15T09:30:00Z" } },
  { text: "Remind me tomorrow at 4pm to call Marina", want: { at: "2026-11-10T13:00:00Z" } },
  { text: "напомни в 10 завтра про встречу с Владом", want: { at: "2026-11-10T07:00:00Z" } },
  { text: "Напомни завтра в 10 вечера выключить сервер", want: { at: "2026-11-10T19:00:00Z" } },
  // Coming again (шаг 6): one promise with its first time, not a rule of kind date.
  { text: "Напоминай каждый понедельник в 10 про отчёт по закупкам", want: { at: "2026-11-16T07:00:00Z", repeat: "week" } },
  { text: "Каждый день в 9 утра напоминай проверить почту склада", want: { at: "2026-11-10T06:00:00Z", repeat: "day" } },
  { text: "Напоминай по будням в 18:00 заполнить таймшит", want: { at: "2026-11-09T15:00:00Z", repeat: "weekdays" } },
  { text: "Напоминай 25 числа каждого месяца в 12:00 оплатить аренду", want: { at: "2026-11-25T09:00:00Z", repeat: "month" } },
  { text: "Каждую пятницу в 16:00 напоминай отправить Игорю сводку", want: { at: "2026-11-13T13:00:00Z", repeat: "week" } },
  { text: "Ольга Ли обещала прислать договор к пятнице", want: { none: true } },
  { text: "Мне нужно позвонить Ольге завтра", want: { none: true } },
  { text: "Не напоминай мне про отчёт, я помню", want: { none: true } },
  { text: "Встреча с Игорем Беловым завтра в 15:00", want: { none: true } },
  { text: "Спасибо, что напомнил про акт — всё подписал", want: { none: true } },
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
  memoryInstructions({
    cards: shown,
    reminding: asksReminder(text),
    repeating: repeatsDate(text),
    sentAt: NOW,
    timeZone: TIMEZONE,
  });

type Out = (typeof extractionSchema)["_output"];

const judge = (c: (typeof cases)[number], out: Out) => {
  const plan = planWrite(out, { cards: shown, commitments: [], selfId: SELF.id, timeZone: TIMEZONE });
  const reminded = plan.records.filter((r) => r.kind === "commitment" && r.remindAt);
  const w = c.want;
  if ("none" in w) return reminded.length === 0 ? null : `a reminder where none was asked: «${reminded[0]?.text}» at ${reminded[0]?.remindAt?.toISOString()}`;
  const hit = reminded.find((r) => r.remindAt?.getTime() === new Date(w.at).getTime());
  if (!hit) {
    return `no reminder at ${w.at}; got ${JSON.stringify(plan.records.filter((r) => r.kind === "commitment").map((r) => [r.text, r.remindAt?.toISOString(), r.dueAt?.toISOString(), r.remindRepeat]))}`;
  }
  if (hit.remindRepeat !== w.repeat) return `repeat ${hit.remindRepeat ?? "none"}, wanted ${w.repeat ?? "none"}`;
  const dateRule = plan.records.find((r) => r.kind === "rule" && r.rule?.kind === "date");
  return w.repeat && dateRule ? `a date rule beside the reminder: «${dateRule.text}»` : null;
};

if (DRY) {
  for (const [i, c] of cases.entries()) {
    console.log(`${i + 1}. ${asksReminder(c.text) ? "rule in prompt" : "no rule      "} ${"none" in c.want ? "(none wanted)" : ""} ${c.text}`);
  }
  const missed = cases.filter((c) => !("none" in c.want) && !asksReminder(c.text));
  console.log(`asked cases the prompt does not offer the rule to: ${missed.length}`);
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
          console.log(`      ${JSON.stringify(r.output.items.map((x) => [x.kind, x.text, x.remind, x.repeat, x.due, x.debtor]))}`);
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
    no_reminder_where_none: `${negativesRight}/${negatives}`,
    reminder_where_asked: `${positivesRight}/${positives}`,
    total: `${right}/${cases.length}`,
  })
);
