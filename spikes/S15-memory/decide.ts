// S15 part 5 «модель решений делает больше» (2026-11-10): can a decision model take work off the writer — say whether
// a message names a project (so the writer gets that rule only then), and how a new statement stands to an old one
// (replaces, adds, restates, unrelated) — instead of the writer carrying the old facts in its prompt? Gateway only.
//
//   pnpm run decide                       # Decision-1 and Jev, ~40 calls, a few cents at most
//   MODELS=baseten/mammoth-1 pnpm run decide

import { createGateway } from "@ai-sdk/gateway";
import { experimental_evaluate as evaluate } from "ai";

import { sourceKey } from "../S13-jev/keys.ts";

const gw = createGateway({ apiKey: sourceKey("gateway").key });
const MODELS = (process.env.MODELS ?? "microsoft/microsoft-decision-1,typesafe-ai/jev-1.14.0").split(",");

const PROJECT = {
  project: {
    instructions:
      "Does the message name a project — a named piece of work, product or initiative (like «Склад 2.0» or «v2 портала КАСКАД Плюс») that someone is doing, launching or tracking? A one-off request to the assistant (write, count, make a report) is not a project.",
    type: "boolean",
  },
} as const;

const RELATION = {
  relation: {
    criteria: {
      adds: "Both are true: the new statement adds something beside the old one.",
      replaces:
        "The new statement says the old one is no longer true or has changed: a new stage, a new position, a meeting moved or cancelled, a correction.",
      restates: "The new statement says the same as the old one.",
      unrelated: "They are about different things.",
    },
    instructions:
      "How does the new statement stand to the old record? Read the message the new statement comes from.",
    type: "choice",
  },
} as const;

const projects: { text: string; yes: boolean }[] = [
  { text: "он сейчас делает v2 портала КАСКАД Плюс, обещал сегодня доделать", yes: true },
  { text: "«Склад 2.0» перешёл в тестирование", yes: true },
  { text: "Андрей Смирнов руководит запуском мобильного приложения", yes: true },
  { text: "Мы готовим переезд офиса на январь", yes: true },
  { text: "Бюджет 2027 согласуем в декабре", yes: true },
  { text: "Составь отчёт по продажам за октябрь", yes: false },
  { text: "посчитай 15% от 240 тысяч", yes: false },
  { text: "Марина любит, когда ей дают свободу в макетах", yes: false },
  { text: "Ольга прислала договор", yes: false },
  { text: "Напиши письмо Вектору", yes: false },
];

const pairs: { message: string; old: string; next: string; want: string }[] = [
  { message: "Встречу с «Вектором» перенесли на четверг", next: "Встреча с «Вектором» в четверг, 12 ноября", old: "Встреча с ООО «Вектор» в среду, 11 ноября", want: "replaces" },
  { message: "«Склад 2.0» перешёл в тестирование", next: "«Склад 2.0» в тестировании", old: "«Склад 2.0» на этапе разработки", want: "replaces" },
  { message: "Планёрки по складу в пятницу не будет", next: "Планёрка по «Складу 2.0» в пятницу отменена", old: "Планёрка по «Складу 2.0» в пятницу", want: "replaces" },
  { message: "Светлана Петрова теперь финансовый директор", next: "Светлана Петрова — финансовый директор", old: "Светлана Петрова — главный бухгалтер", want: "replaces" },
  { message: "Марина теперь предпочитает звонки, а не мессенджер", next: "Марина Орлова предпочитает звонки", old: "Марина Орлова предпочитает общаться в мессенджере", want: "replaces" },
  { message: "Не во вторник, а в среду созвон с Ольгой", next: "Созвон с Ольгой Ли в среду, 11 ноября", old: "Созвон с Ольгой Ли во вторник, 10 ноября", want: "replaces" },
  { message: "Андрей Смирнов ещё ведёт код-ревью в команде", next: "Андрей Смирнов ведёт код-ревью", old: "Андрей Смирнов — разработчик бэкенда", want: "adds" },
  { message: "Ещё одна встреча с «Вектором» — в пятницу", next: "Встреча с «Вектором» в пятницу, 13 ноября", old: "Встреча с ООО «Вектор» в среду, 11 ноября", want: "adds" },
  { message: "Игорь Белов любит, когда отчёты приходят утром", next: "Игорь Белов любит получать отчёты утром", old: "Игорь Белов — руководитель отдела продаж", want: "unrelated" },
  { message: "Андрей Смирнов знает Go", next: "Андрей Смирнов знает Go", old: "Ольга Ли — менеджер в «Альфа-Логистике»", want: "unrelated" },
  { message: "Андрей Смирнов — разработчик бэкенда, как я и говорил", next: "Андрей Смирнов — разработчик бэкенда", old: "Андрей Смирнов — разработчик бэкенда", want: "restates" },
];

const pct = (a: number, b: number) => `${a}/${b} (${Math.round((100 * a) / b)} %)`;

for (const id of MODELS) {
  const ms: number[] = [];
  let tokens = 0;
  let calls = 0;
  const call = async <Q extends Record<string, never>>(questions: Q, state: object) => {
    const started = performance.now();
    const r = await evaluate({
      maxRetries: 2,
      model: gw.evaluationModel(id),
      providerOptions: { gateway: { zeroDataRetention: true } },
      questions,
      state: state as never,
    });
    ms.push(performance.now() - started);
    tokens += r.usage.inputTokens ?? 0;
    calls += 1;
    return r.answers as never as Record<string, { probability?: number; choice?: string; probabilities?: Record<string, number> }>;
  };
  let right = 0;
  let sure = 0;
  let sureWrong = 0;
  for (const c of projects) {
    try {
      const a = await call(PROJECT as never, { message: c.text });
      const p = a.project?.probability ?? 0.5;
      const said = p >= 0.5;
      if (said === c.yes) right += 1;
      if (p >= 0.9 || p <= 0.1) {
        sure += 1;
        if (said !== c.yes) sureWrong += 1;
      }
      if (said !== c.yes || (p > 0.1 && p < 0.9)) console.log(`  project ${said === c.yes ? "~" : "✗"} P=${p.toFixed(2)} want ${c.yes}: ${c.text}`);
    } catch (error) {
      console.log(`  ! ${c.text}: ${(error as Error).message.slice(0, 100)}`);
    }
  }
  const projectLine = { right: pct(right, projects.length), sure: sure, sure_wrong: sureWrong };
  right = 0;
  sure = 0;
  sureWrong = 0;
  let replaceMiss = 0;
  for (const c of pairs) {
    try {
      const a = await call(RELATION as never, { message: c.message, new: c.next, old: c.old });
      const choice = a.relation?.choice ?? "?";
      const p = a.relation?.probabilities?.[choice] ?? 0;
      if (choice === c.want) right += 1;
      // The one that matters: «replaces» said where the two are not a replacement damages a memory.
      if (choice === "replaces" && c.want !== "replaces") replaceMiss += 1;
      if (p >= 0.9) {
        sure += 1;
        if (choice !== c.want) sureWrong += 1;
      }
      if (choice !== c.want || p < 0.9) console.log(`  relation ${choice === c.want ? "~" : "✗"} ${choice} P=${p.toFixed(2)} want ${c.want}: ${c.message}`);
    } catch (error) {
      console.log(`  ! ${c.message}: ${(error as Error).message.slice(0, 100)}`);
    }
  }
  const sorted = ms.toSorted((a, b) => a - b);
  console.log(
    JSON.stringify({
      calls,
      model: id,
      p50_ms: Math.round(sorted[Math.floor(sorted.length / 2)] ?? 0),
      project: projectLine,
      relation: { right: pct(right, pairs.length), sure, sure_wrong: sureWrong, wrong_replaces: replaceMiss },
      tokens_per_call: Math.round(tokens / Math.max(1, calls)),
    })
  );
}
