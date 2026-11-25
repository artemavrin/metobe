"use client";

import { createContext, use, useState } from "react";
import type { ReactNode } from "react";

import { ORGS, SERVERS_PER_SEAT, TARIFFS, TARIFF_IDS, modelById, net, priceFor } from "../_orgs/data";
import type { Tariff, TariffId } from "../_orgs/data";
import { useProto } from "../memory/frame";

// Состояние P38: сохранённые тарифы, черновик открытого тарифа и «покрутить» прогноза. Прогноз считается здесь по
// выдуманным средним — в продукте он пересчитывает записанные ответы последних 4–8 недель (S26), как внутренний
// калькулятор. Ничего из «покрутить» не сохраняется, пока не нажато «Применить к тарифу».

export type Screen = "tariff" | "forecast";

/** Средний расход места на модели за последние 4 недели, в долларах (выдумано). */
const SPEND_USD: Record<TariffId, number> = { basic: 2.6, max: 19.5, pro: 6.8 };
/** Доля человеко-недель с упором в недельный лимит и доля отклонённых запросов (выдумано). */
const HIT: Record<TariffId, number> = { basic: 4.1, max: 1.6, pro: 3.2 };
const REJECTED: Record<TariffId, number> = { basic: 0.7, max: 0.2, pro: 0.5 };
const NEAR: Record<TariffId, number> = { basic: 6, max: 1, pro: 3 };

export interface Knobs {
  /** Курс доллара. */
  rate: number;
  /** Комиссия за оплату в долларах, %. */
  fee: number;
  /** НДС, %. */
  vat: number;
  /** Рост нагрузки, %. */
  growth: number;
  /** Недельные лимиты по тарифам. */
  week: Record<TariffId, number>;
  /** «Все ответы на модели X»; пусто — как сейчас. */
  allOn: string;
}

export const BASE_RATE = 92;
export const BASE_FEE = 3;

export const knobsFrom = (tariffs: Tariff[]): Knobs => ({
  allOn: "",
  fee: BASE_FEE,
  growth: 0,
  rate: BASE_RATE,
  vat: tariffs[0].vat,
  week: Object.fromEntries(tariffs.map((t) => [t.id, t.week])) as Record<TariffId, number>,
});

/** Места на следующий месяц у платящих организаций (пробные и отключённые вручную не платят). */
const payingOrgs = ORGS.filter((o) => o.status === "active");

export const seatsNext = (t: TariffId) => payingOrgs.reduce((a, o) => a + o.next[t], 0);

export interface TariffEconomy {
  id: TariffId;
  seats: number;
  /** На одно место, ₽ в месяц. */
  revenue: number;
  models: number;
  worst: number;
  servers: number;
  hit: number;
  rejected: number;
  near: number;
}

/** Экономика тарифа на одно место при данных ручках. */
export const economy = (t: Tariff, k: Knobs): TariffEconomy => {
  const limitRatio = k.week[t.id] / t.week;
  // Ниже лимит — тяжёлые люди тратят меньше и упираются чаще; выше — наоборот (приближение для прототипа).
  const heavy = HIT[t.id] / 100 + 0.08;
  const limitFactor = limitRatio < 1 ? 1 - heavy * (1 - limitRatio) : 1 + heavy * (limitRatio - 1) * 0.5;
  const modelFactor = k.allOn ? modelById(k.allOn).perAnswer / modelById(t.defaultModel).perAnswer : 1;
  const models = SPEND_USD[t.id] * k.rate * (1 + k.fee / 100) * (1 + k.growth / 100) * limitFactor * modelFactor;
  const hitNow = Math.min(60, HIT[t.id] * limitRatio ** -1.6 * (1 + k.growth / 100) * modelFactor ** 0.8);
  return {
    hit: hitNow,
    id: t.id,
    models,
    near: Math.round(NEAR[t.id] * (hitNow / HIT[t.id])),
    rejected: REJECTED[t.id] * (hitNow / HIT[t.id]),
    revenue: net({ ...t, vat: k.vat }),
    seats: seatsNext(t.id),
    servers: SERVERS_PER_SEAT,
    worst: k.week[t.id] * 4.34,
  };
};

export interface MonthForecast {
  revenue: number;
  vat: number;
  models: number;
  servers: number;
  left: number;
  byTariff: TariffEconomy[];
  byOrg: { id: string; name: string; seats: number; revenue: number; models: number; left: number }[];
}

export const forecast = (tariffs: Tariff[], k: Knobs): MonthForecast => {
  const byTariff = tariffs.map((t) => economy(t, k));
  const per = (id: TariffId) => byTariff.find((e) => e.id === id) ?? byTariff[0];
  const byOrg = payingOrgs.map((o) => {
    const revenue = TARIFF_IDS.reduce((a, id) => a + o.next[id] * priceFor(o, id), 0);
    const models = TARIFF_IDS.reduce((a, id) => a + o.next[id] * per(id).models, 0);
    const servers = TARIFF_IDS.reduce((a, id) => a + o.next[id] * SERVERS_PER_SEAT, 0);
    return { id: o.id, left: revenue - models - servers, models, name: o.name, revenue, seats: TARIFF_IDS.reduce((a, id) => a + o.next[id], 0) };
  });
  const revenue = byOrg.reduce((a, o) => a + o.revenue, 0);
  const models = byOrg.reduce((a, o) => a + o.models, 0);
  const servers = byTariff.reduce((a, e) => a + e.seats * e.servers, 0);
  return { byOrg, byTariff, left: revenue - models - servers, models, revenue, servers, vat: (revenue * k.vat) / 100 };
};

const sameKnobs = (a: Knobs, b: Knobs) => JSON.stringify(a) === JSON.stringify(b);

const useTariffsState = () => {
  const { knobs, setKnob, say } = useProto();
  const [tariffs, setTariffs] = useState<Tariff[]>(TARIFFS);
  const base = knobsFrom(tariffs);
  const [tweak, setTweak] = useState<Knobs>(base);
  const id = (knobs.t ?? "basic") as TariffId;
  return {
    apply: () => {
      const changed = tariffs.filter((t) => tweak.week[t.id] !== t.week || tweak.vat !== t.vat);
      const next = tariffs.map((t) => ({ ...t, fiveHours: t.fiveHours === null ? null : Math.round(tweak.week[t.id] / 3), vat: tweak.vat, week: tweak.week[t.id] }));
      setTariffs(next);
      setTweak({ ...knobsFrom(next), fee: tweak.fee, growth: tweak.growth, rate: tweak.rate, allOn: tweak.allOn });
      say(changed.length ? `Применено к тарифам: ${changed.map((t) => t.name).join(", ")}` : "Тарифы не менялись");
    },
    base,
    /** Что в «покрутить» отличается от сохранённого. */
    dirty: !sameKnobs(tweak, base),
    /** Изменены ли ручки, которые «Применить к тарифу» сохранит (лимиты и НДС). */
    dirtyTariff: TARIFF_IDS.some((t) => tweak.week[t] !== base.week[t]) || tweak.vat !== base.vat,
    go: (scr: Screen, t?: TariffId) => {
      if (t) setKnob("t", t);
      setKnob("scr", scr);
    },
    reset: () => setTweak(base),
    save: (t: Tariff) => {
      setTariffs((all) => all.map((x) => (x.id === t.id ? t : x)));
      setTweak((k) => ({ ...k, vat: t.vat, week: { ...k.week, [t.id]: t.week } }));
      say(`Тариф «${t.name}» сохранён`);
    },
    scr: (knobs.scr ?? "tariff") as Screen,
    setTweak,
    tariff: tariffs.find((t) => t.id === id) ?? tariffs[0],
    tariffs,
    tweak,
  };
};

export type TariffsState = ReturnType<typeof useTariffsState>;

const Ctx = createContext<TariffsState>(null as never);

export const TariffsStateProvider = ({ children }: { children: ReactNode }) => <Ctx value={useTariffsState()}>{children}</Ctx>;

export const useTariffs = () => use(Ctx);
