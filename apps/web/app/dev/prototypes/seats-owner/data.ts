import { useState } from "react";

import { TIERS, TIER_ORDER } from "../seat-limits/data";
import type { Tier } from "../seat-limits/data";

// Моки P37 (ORGS-PLAN §6): организация «Северный ветер», сегодня 25 ноября, в ноябре 30 дней — до конца месяца 6 дней
// вместе с сегодняшним. Цены мест моковые (только отношение ×1/×2/×4 — из плана), владелец видит цену места и
// доплату, но не расход на модели. Те же значения — у P36 и P38.

export { TIERS, TIER_ORDER };
export type { Tier };

export const PRICE: Record<Tier, number> = { base: 1000, max: 4000, pro: 2000 };
export const MONTH = { days: 30, left: 6, next: "декабрь", nextIn: "декабре", now: "ноябрь", nowIn: "ноябре", today: "25 ноября" };

export const rub = (n: number) => `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n)} ₽`;
/** Доплата за остаток месяца, день добавления считается. */
export const prorate = (perMonth: number) => Math.round((perMonth * MONTH.left) / MONTH.days);

export interface Person {
  id: string;
  name: string;
  email: string;
  tier: Tier;
  /** Приглашение без ответа тоже занимает место. */
  invited?: boolean;
  owner?: boolean;
  /** С 1-го числа — понижение тарифа. */
  nextTier?: Tier;
  /** Использование: процент недели, запросы за неделю, сколько раз упирался в лимит за 4 недели. */
  week: number;
  requests: number;
  hits: number;
}

const P = (id: string, name: string, tier: Tier, week: number, requests: number, hits = 0, extra: Partial<Person> = {}): Person => ({
  email: `${id}@severveter.example`,
  hits,
  id,
  name,
  requests,
  tier,
  week,
  ...extra,
});

const PEOPLE: Person[] = [
  P("belova", "Анна Белова", "max", 41, 212, 0, { owner: true }),
  P("smirnov", "Олег Смирнов", "pro", 100, 388, 3),
  P("kuznetsova", "Мария Кузнецова", "pro", 63, 190),
  P("orlov", "Игорь Орлов", "pro", 12, 40),
  P("volkova", "Елена Волкова", "base", 86, 154, 1),
  P("lebedev", "Павел Лебедев", "base", 34, 71),
  P("sokolova", "Дарья Соколова", "base", 22, 58),
  P("morozov", "Андрей Морозов", "base", 9, 17),
  P("novikova", "Ольга Новикова", "base", 5, 12),
  P("fedorov", "Сергей Фёдоров", "base", 1, 3),
  P("pavlova", "Ирина Павлова", "base", 0, 0),
  P("new1", "", "base", 0, 0, 0, { email: "k.titov@severveter.example", invited: true }),
];

export type Load = "some" | "full";
/** Мест сейчас: при `full` свободных нет ни одного. */
const SEATS: Record<Load, Record<Tier, number>> = {
  full: { base: 8, max: 1, pro: 3 },
  some: { base: 10, max: 1, pro: 3 },
};

export const useSeats = (load: Load, short: boolean) => {
  const [people, setPeople] = useState(PEOPLE);
  const [seats, setSeats] = useState(SEATS[load]);
  const [next, setNext] = useState<Record<Tier, number>>(short ? { ...SEATS[load], base: 6 } : SEATS[load]);
  /** Доплаты в следующий счёт: строка на каждое добавление места и повышение. */
  const [extra, setExtra] = useState<{ text: string; sum: number }[]>([]);
  const list = people;
  const taken = (t: Tier) => list.filter((p) => p.tier === t).length;
  const free = (t: Tier) => Math.max(0, seats[t] - taken(t));
  /** На 1-е мест станет столько, сколько занято, если занято больше. */
  const nextTaken = (t: Tier) => list.filter((p) => (p.nextTier ?? p.tier) === t).length;
  return {
    addSeats: (t: Tier, n: number) => {
      setSeats((s) => ({ ...s, [t]: s[t] + n }));
      setNext((s) => ({ ...s, [t]: s[t] + n }));
      setExtra((e) => [...e, { sum: prorate(PRICE[t] * n), text: `${n} ${TIERS[t].title} с ${MONTH.today}` }]);
    },
    /** Повышение — сразу: место меняет тариф, доплата — разница за остаток месяца. Понижение — с 1-го. */
    change: (id: string, to: Tier) => {
      const p = people.find((x) => x.id === id);
      if (!p) return;
      const up = TIER_ORDER.indexOf(to) > TIER_ORDER.indexOf(p.tier);
      if (up) {
        const from = p.tier;
        setSeats((s) => ({ ...s, [from]: s[from] - 1, [to]: s[to] + 1 }));
        setNext((s) => ({ ...s, [from]: Math.max(0, s[from] - 1), [to]: s[to] + 1 }));
        setExtra((e) => [...e, { sum: upgradeSum(from, to), text: `${p.name || p.email}: ${TIERS[from].title} → ${TIERS[to].title} с ${MONTH.today}` }]);
      }
      if (!up && to !== p.tier && !p.nextTier) {
        const from = p.tier;
        setNext((s) => ({ ...s, [from]: Math.max(0, s[from] - 1), [to]: s[to] + 1 }));
      }
      setPeople((ps) => ps.map((x) => (x.id === id ? (up ? { ...x, nextTier: undefined, tier: to } : { ...x, nextTier: to === x.tier ? undefined : to }) : x)));
    },
    extra,
    free,
    invite: (email: string, t: Tier) => setPeople((ps) => [...ps, P(`inv${ps.length}`, "", t, 0, 0, 0, { email: email || "по ссылке", invited: true })]),
    next,
    nextTaken,
    people: list,
    /** Отключённый человек места не занимает, данные остаются; оплата за месяц не меняется. */
    disable: (id: string) => setPeople((ps) => ps.filter((p) => p.id !== id)),
    seats,
    setNext: (t: Tier, n: number) => setNext((s) => ({ ...s, [t]: Math.max(0, n) })),
    taken,
  };
};
export type Seats = ReturnType<typeof useSeats>;

/** Доплата при повышении: разница цен за остаток месяца. */
export const upgradeSum = (from: Tier, to: Tier) => prorate(PRICE[to] - PRICE[from]);

export const nextBill = (s: Seats) => TIER_ORDER.reduce((sum, t) => sum + Math.max(s.next[t], s.nextTaken(t)) * PRICE[t], 0) + s.extra.reduce((a, e) => a + e.sum, 0);

export const initials = (p: Person) =>
  (p.name || p.email)
    .split(/[\s.@]+/u)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

export const seatsWord = (n: number) => {
  const d = n % 10;
  const dd = n % 100;
  return d === 1 && dd !== 11 ? "место" : d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? "места" : "мест";
};
