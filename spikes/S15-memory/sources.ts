// S15 part «источники» (И1, MEMORY-PLAN §5.6): the memory does not depend on where its material comes from. Each of
// 10 cases is given three ways — the person's message, a letter from the one who speaks in it, a meeting's transcript
// with the person in it — and the records are compared: the sides of a commitment, its day, the kind. The writer is
// shown what it would be shown (`memoryInstructions`, `memoryPromptOf`), its answer goes through `planWrite` and the
// table of voices (`limitByVoice`). Aim: the same outcome three ways in 9 of 10. Gateway only.
//
//   DRY=1 pnpm run sources       # no model: the three prompts of each case
//   pnpm run sources             # meta/muse-ember — about $0.03 for 30 materials
//   ONLY=3 SHOW=1 pnpm run sources

import { createGateway } from "@ai-sdk/gateway";
import { generateText, Output } from "ai";

import type { MemoryEntity } from "../../packages/core/src/memory.ts";
import { limitByVoice } from "../../packages/core/src/memory-evidence.ts";
import { extractionSchema, memoryInstructions, planWrite } from "../../packages/core/src/memory-extract.ts";
import type { KnownCard } from "../../packages/core/src/memory-extract.ts";
import { memoryPromptOf, messageSegments, othersSpeak, ownerSpeaks } from "../../packages/core/src/memory-input.ts";
import type { Segment } from "../../packages/core/src/memory-input.ts";
import { TIMEZONE } from "../S13-jev/extract-cases.ts";
import { sourceKey } from "../S13-jev/keys.ts";
import { NOW, SELF } from "./memory300.ts";

const MODEL = process.env.MODEL ?? "meta/muse-ember";
const DRY = Boolean(process.env.DRY);
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",").map(Number)) : null;

const card = (id: string, kind: MemoryEntity["kind"], name: string, role: string): KnownCard => ({
  aliases: [],
  id,
  kind,
  name,
  ref: id,
  role,
});
const cards: KnownCard[] = [
  card("olga_li", "person", "Ольга Ли", "менеджер в «Альфа-Логистике»"),
  card("andrey_kovalev", "person", "Андрей Ковалёв", "менеджер по закупкам в «Векторе»"),
  card("marina_orlova", "person", "Марина Орлова", "дизайнер"),
  card("svetlana_petrova", "person", "Светлана Петрова", "главный бухгалтер"),
  card("andrey_smirnov", "person", "Андрей Смирнов", "разработчик бэкенда"),
];
const nameOf = new Map(cards.map((c) => [c.id, c.name]));

const by = (id: string) => ({ kind: "card" as const, name: nameOf.get(id) ?? id, ref: id });
const owner = { kind: "owner" as const };

/** One case three ways: what the person says, what the one who speaks writes, how it goes at a meeting. */
const cases: { who: string; message: string; letter: string; meeting: [string | "owner", string][] }[] = [
  {
    letter: "Добрый день! Подписанный договор пришлю к пятнице.\nОльга",
    meeting: [["olga_li", "Подписанный договор пришлю к пятнице."], ["owner", "Хорошо, жду."]],
    message: "Ольга Ли сказала, что пришлёт подписанный договор к пятнице",
    who: "olga_li",
  },
  {
    letter: "Пришлите, пожалуйста, спецификацию до среды.\nАндрей",
    meeting: [["andrey_kovalev", "Пришлите спецификацию до среды, пожалуйста."], ["owner", "Да, пришлю."]],
    message: "Андрей Ковалёв попросил меня прислать спецификацию до среды",
    who: "andrey_kovalev",
  },
  {
    letter: "Макеты главной страницы пришлю к 16 ноября.\nМарина",
    meeting: [["marina_orlova", "Макеты главной будут к 16 ноября."], ["owner", "Договорились."]],
    message: "Марина Орлова пришлёт макеты главной страницы к 16 ноября",
    who: "marina_orlova",
  },
  {
    letter: "Счёт оплачу завтра.\nСветлана",
    meeting: [["owner", "Когда оплатим счёт?"], ["svetlana_petrova", "Завтра оплачу."]],
    message: "Светлана Петрова оплатит счёт завтра",
    who: "svetlana_petrova",
  },
  {
    letter: "API закончу к пятнице.\nАндрей Смирнов",
    meeting: [["andrey_smirnov", "API закончу к пятнице."], ["owner", "Отлично."]],
    message: "Андрей Смирнов закончит API к пятнице",
    who: "andrey_smirnov",
  },
  {
    letter: "Добрый день! Теперь я руковожу отделом закупок в «Альфа-Логистике».\nОльга",
    meeting: [["olga_li", "Кстати, я теперь руковожу отделом закупок в «Альфа-Логистике»."], ["owner", "Поздравляю!"]],
    message: "Ольга Ли теперь руководит отделом закупок в «Альфа-Логистике»",
    who: "olga_li",
  },
  {
    letter: "Предупреждаю: с 16 по 20 ноября я в отпуске.\nАндрей Смирнов",
    meeting: [["andrey_smirnov", "С 16 по 20 ноября я в отпуске."], ["owner", "Понял."]],
    message: "Андрей Смирнов в отпуске с 16 по 20 ноября",
    who: "andrey_smirnov",
  },
  {
    letter: "Макеты пришлю в понедельник, а текст для главной — во вторник.\nМарина",
    meeting: [["marina_orlova", "Макеты пришлю в понедельник, а текст для главной — во вторник."], ["owner", "Хорошо."]],
    message: "Марина Орлова пришлёт макеты в понедельник, а текст для главной во вторник",
    who: "marina_orlova",
  },
  {
    letter: "Коммерческое предложение по сканерам пришлю завтра.\nАндрей Ковалёв",
    meeting: [["owner", "Когда ждать КП по сканерам?"], ["andrey_kovalev", "Завтра пришлю."]],
    message: "Андрей Ковалёв пришлёт коммерческое предложение по сканерам завтра",
    who: "andrey_kovalev",
  },
  {
    letter: "Акт сверки подпишу до 13 ноября.\nСветлана",
    meeting: [["svetlana_petrova", "Акт сверки подпишу до 13 ноября."], ["owner", "Спасибо."]],
    message: "Светлана Петрова подпишет акт сверки до 13 ноября",
    who: "svetlana_petrova",
  },
];

const ways = (c: (typeof cases)[number]): [string, Segment[]][] => [
  ["message", messageSegments(c.message)],
  ["letter", [{ speaker: by(c.who), text: c.letter, voice: "own" }]],
  [
    "meeting",
    c.meeting.map(([who, text]) => ({ speaker: who === "owner" ? owner : by(who), text, voice: "own" as const })),
  ],
];

const day = (d: Date | undefined | null) =>
  d ? new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(d) : "-";

/** What a material came to, in a line to compare: the commitments with their sides and day, the other kinds by card. */
const outcome = (out: (typeof extractionSchema)["_output"], segments: Segment[]) => {
  const plan = limitByVoice(
    planWrite(out, { cards, commitments: [], selfId: SELF.id, timeZone: TIMEZONE }),
    ownerSpeaks(segments)
  );
  const side = (r: (typeof plan.records)[number], role: string) => {
    const l = r.entities.find((e) => e.role === role);
    return l && "entityId" in l ? l.entityId : "?";
  };
  return plan.records
    .map((r) =>
      r.kind === "commitment"
        ? `commitment ${side(r, "debtor")}→${side(r, "creditor")} ${day(r.dueAt)}`
        : `${r.kind === "event" || r.kind === "fact" ? "fact|event" : r.kind} ${r.entities.flatMap((l) => ("entityId" in l && l.entityId !== SELF.id ? [l.entityId] : [])).join(",")}`
    )
    .sort()
    .join("; ");
};

const instructionsOf = (segments: Segment[]) =>
  memoryInstructions({ cards, quoted: segments.some((s) => s.voice === "quoted"), said: othersSpeak(segments), sentAt: NOW, timeZone: TIMEZONE });

const picked = cases.map((c, i) => ({ c, i: i + 1 })).filter(({ i }) => !ONLY || ONLY.has(i));
if (DRY) {
  for (const { c, i } of picked) for (const [way, s] of ways(c)) console.log(`--- ${i} ${way}\n${memoryPromptOf(s)}`);
  process.exit(0);
}

const gw = createGateway({ apiKey: sourceKey("gateway").key });
let cost = 0;
let same = 0;
await Promise.all(
  picked.map(async ({ c, i }) => {
    const got = await Promise.all(
      ways(c).map(async ([way, segments]) => {
        try {
          const r = await generateText({
            instructions: instructionsOf(segments),
            maxRetries: 2,
            model: gw(MODEL),
            output: Output.object({ schema: extractionSchema }),
            prompt: memoryPromptOf(segments),
            providerOptions: { gateway: { zeroDataRetention: true } },
            reasoning: "low",
          });
          cost += Number((r.providerMetadata?.gateway as { cost?: string } | undefined)?.cost ?? 0);
          return [way, outcome(r.output, segments)] as const;
        } catch (error) {
          return [way, `! ${(error as Error).message.slice(0, 80)}`] as const;
        }
      })
    );
    const alike = new Set(got.map(([, o]) => o)).size === 1;
    if (alike) same += 1;
    if (!alike || process.env.SHOW) {
      console.log(`  ${alike ? "✓" : "✗"} ${i}. ${c.message}`);
      for (const [way, o] of got) console.log(`      ${way.padEnd(8)} ${o || "(nothing)"}`);
    }
  })
);
console.log(JSON.stringify({ cost: `$${cost.toFixed(4)}`, model: MODEL, same: `${same}/${picked.length}` }));
