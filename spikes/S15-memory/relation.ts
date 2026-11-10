// S15 part 5 «relation» (ARCH §19.9.3): the decision model that confirms a replacement the writer names. Given the
// message, the new statement, the old record and the days of both — as the app gives them (`pairDays`) — does it keep a
// real replacement on a sure «replaces» and take off one that only adds? A wrong replacement ends a true fact or sets
// aside a true event, so the additions are the cases that matter. 19 pairs of the S15 «обновление» messages.
// Gateway only. For `pnpm memory:eval` (set `relation`); the model is GATE_MODEL, Decision-1 by default.

import { REPLACE_MIN, relationState, withConfirmed } from "../../packages/core/src/memory-relations.ts";
import type { RelationAnswer } from "../../packages/core/src/memory-relations.ts";
import { caseId, type EvalCase } from "../S13-jev/eval-case.ts";

/** The old records: what the memory holds, and the day it begins (a fact) or is (an event). */
const OLD: Record<string, { kind: "fact" | "event"; text: string; day: string }> = {
  E_OLGA: { day: "2026-11-10", kind: "event", text: "Созвон с Ольгой Ли во вторник" },
  E_ONE: { day: "2026-11-12", kind: "event", text: "Встреча один на один с Андреем Смирновым в четверг" },
  E_PLAN: { day: "2026-11-13", kind: "event", text: "Планёрка по «Складу 2.0» в пятницу" },
  E_PRES: { day: "2026-11-13", kind: "event", text: "Презентация для клиента в пятницу" },
  E_VECTOR: { day: "2026-11-11", kind: "event", text: "Встреча с ООО «Вектор» в среду" },
  F_ANDREY: { day: "2025-03-01", kind: "fact", text: "Андрей Смирнов — разработчик бэкенда" },
  F_IGOR: { day: "2024-01-15", kind: "fact", text: "Игорь Белов — руководитель отдела продаж" },
  F_MARINA: { day: "2026-09-10", kind: "fact", text: "Марина Орлова предпочитает общаться в мессенджере" },
  F_OLGA: { day: "2025-11-01", kind: "fact", text: "Ольга Ли — менеджер в «Альфа-Логистике»" },
  F_STAGE: { day: "2026-10-02", kind: "fact", text: "«Склад 2.0» на этапе разработки" },
  F_SVET: { day: "2023-06-01", kind: "fact", text: "Светлана Петрова — главный бухгалтер" },
};

interface Pair {
  /** The message the new statement comes from. */
  text: string;
  next: string;
  /** The day of the new record: today for a fact, the day of the meeting for an event. */
  day: string;
  old: keyof typeof OLD;
  replaces: boolean;
}

const pairs: Pair[] = [
  { day: "2026-11-09", next: "«Склад 2.0» в тестировании", old: "F_STAGE", replaces: true, text: "«Склад 2.0» перешёл в тестирование" },
  { day: "2026-11-09", next: "Андрей Смирнов — тимлид бэкенда", old: "F_ANDREY", replaces: true, text: "Андрея Смирнова назначили тимлидом бэкенда" },
  { day: "2026-11-09", next: "Игорь Белов — коммерческий директор в «Векторе»", old: "F_IGOR", replaces: true, text: "Игорь Белов перешёл в «Вектор» коммерческим директором" },
  { day: "2026-11-09", next: "Светлана Петрова — финансовый директор", old: "F_SVET", replaces: true, text: "Светлана Петрова теперь финансовый директор" },
  { day: "2026-11-09", next: "Марина Орлова предпочитает звонки", old: "F_MARINA", replaces: true, text: "Марина теперь предпочитает звонки, а не мессенджер" },
  { day: "2026-11-09", next: "Ольга Ли работает в «Стреле»", old: "F_OLGA", replaces: true, text: "Ольга Ли сменила работу — теперь она в «Стреле»" },
  { day: "2026-11-12", next: "Встреча с «Вектором» в четверг, 12 ноября", old: "E_VECTOR", replaces: true, text: "Встречу с «Вектором» перенесли на четверг" },
  { day: "2026-11-11", next: "Созвон с Ольгой Ли в среду, 11 ноября", old: "E_OLGA", replaces: true, text: "Созвон с Ольгой переносится на среду" },
  { day: "2026-11-16", next: "Планёрка по «Складу 2.0» в понедельник, 16 ноября", old: "E_PLAN", replaces: true, text: "Планёрку по складу сдвинули на понедельник" },
  { day: "2026-11-13", next: "Встреча один на один с Андреем Смирновым в пятницу, 13 ноября", old: "E_ONE", replaces: true, text: "Один на один с Андреем Смирновым теперь в пятницу" },
  { day: "2026-11-12", next: "Презентация для клиента в четверг, 12 ноября", old: "E_PRES", replaces: true, text: "Презентация для клиента будет не в пятницу, а в четверг" },
  { day: "2026-11-11", next: "Встреча с «Вектором» отменена", old: "E_VECTOR", replaces: true, text: "Встречу с «Вектором» отменили" },
  { day: "2026-11-13", next: "Планёрка по «Складу 2.0» в пятницу отменена", old: "E_PLAN", replaces: true, text: "Планёрки по складу в пятницу не будет" },
  { day: "2026-11-11", next: "Созвон с Ольгой Ли в среду, 11 ноября", old: "E_OLGA", replaces: true, text: "Не во вторник, а в среду созвон с Ольгой" },
  { day: "2026-11-12", next: "Планёрка по «Складу 2.0» в четверг, 12 ноября", old: "E_PLAN", replaces: true, text: "Планёрка по складу не в пятницу, а в четверг" },
  { day: "2026-11-09", next: "Андрей Смирнов ведёт код-ревью в команде", old: "F_ANDREY", replaces: false, text: "Андрей Смирнов ещё ведёт код-ревью в команде" },
  { day: "2026-11-09", next: "У «Склада 2.0» два заказчика", old: "F_STAGE", replaces: false, text: "У «Склада 2.0» появился второй заказчик" },
  { day: "2026-11-09", next: "Игорь Белов любит получать отчёты утром", old: "F_IGOR", replaces: false, text: "Игорь Белов любит, когда отчёты приходят утром" },
  { day: "2026-11-13", next: "Встреча с «Вектором» в пятницу, 13 ноября", old: "E_VECTOR", replaces: false, text: "Ещё одна встреча с «Вектором» — в пятницу" },
];

/** The sure «replaces» of one pair, as the app takes it: does the writer's claim stand? */
const stands = (p: Pair, answer: RelationAnswer | undefined) => {
  const old = OLD[p.old] as (typeof OLD)[string];
  const record = { entities: [], kind: old.kind, replaces: p.old, text: p.next };
  const known = { entityIds: [], id: p.old, kind: old.kind, on: null, ref: "", text: old.text };
  const [kept] = withConfirmed([record], [{ index: 0, old: known }], [answer]);
  return Boolean(kept?.replaces);
};

/** The cases for `pnpm memory:eval` (set `relation`). */
export const relationCases = (): EvalCase[] =>
  pairs.map((p, i) => {
    const old = OLD[p.old] as (typeof OLD)[string];
    return {
      id: caseId(i),
      kind: "relation" as const,
      score: (answers: Record<string, RelationAnswer>) => {
        const answer = answers.relation;
        const kept = stands(p, answer);
        const sure = answer?.probabilities?.replaces ?? 0;
        return {
          miss:
            kept === p.replaces
              ? null
              : p.replaces
                ? `held back a real replacement (${answer?.choice} P(replaces)=${sure.toFixed(2)} < ${REPLACE_MIN})`
                : `WRONG: let an addition replace (P=${sure.toFixed(2)})`,
          // «Replaced» is the share of real replacements kept; «no_wrong_replace» — of the additions that were taken off.
          tally: p.replaces ? { replaced: [kept ? 1 : 0, 1] } : { no_wrong_replace: [kept ? 0 : 1, 1] },
        };
      },
      state: relationState(p.text, p.next, old.text, { next: p.day, old: old.day }),
      text: p.text,
    };
  });
