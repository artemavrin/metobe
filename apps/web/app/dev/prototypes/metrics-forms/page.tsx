"use client";

import { useEffect, useState } from "react";

import { Picker } from "../_shared/picker";
import { Frame, Look } from "./frame";
import { CompositionBar, CompositionDonut, FunnelCentered, FunnelStairs, MoversColumns, MoversDiverging, OutliersAxis, OutliersList, ParetoBars, ParetoCurve } from "./forms";

// P5c · «Показатели, ещё формы»: who grew and who fell, Pareto / ABC, outliers, a funnel, a composition (a ring or a
// bar) — each in two looks, A over B, in the strip's style. What it answers: which look of each form reads best, and
// which forms are worth a place in `show_metrics` at all. All but the funnel are computed from the sales register of
// P5b; the funnel from a table of deals (the order of its stages is given by the query or by a stage-number column).

const Mounted = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? children : null;
};

const of = (View: () => React.ReactNode) => () => (
  <Mounted>
    <View />
  </Mounted>
);

const Movers = () => (
  <Frame answer="Выручка в целом выросла, но вырос не каждый: у лидера прибавка, а у нескольких клиентов заметное падение — стоит проверить, не ушли ли заказы к конкурентам." question="Кто из клиентов вырос в сентябре, а кто просел?" title="Клиенты: сентябрь к августу">
    <Look name="Две колонки" note="выросли и упали раздельно" tag="А"><MoversColumns /></Look>
    <Look name="Один ряд" note="ось по центру, одна шкала" tag="Б"><MoversDiverging /></Look>
  </Frame>
);

const Pareto = () => (
  <Frame answer="Для 80 % выручки хватает восьми клиентов из двенадцати: сильной зависимости от одного-двух нет, но три крупнейших дают больше половины." question="Сделай ABC-анализ клиентов по выручке" title="ABC-анализ клиентов">
    <Look name="Кривая" note="картина и классы" tag="А"><ParetoCurve /></Look>
    <Look name="Строки с классами" note="каждый клиент виден" tag="Б"><ParetoBars /></Look>
  </Frame>
);

const Outliers = () => (
  <Frame answer="Семь накладных выше порога: самая крупная в семнадцать раз больше медианы. Это либо крупные разовые сделки, либо ошибки ввода — их стоит открыть по одной." question="Есть ли накладные, которые сильно выбиваются по сумме?" title="Выбросы по сумме накладной">
    <Look name="Список" note="что и когда" tag="А"><OutliersList /></Look>
    <Look name="Ось" note="видно, насколько они далеко" tag="Б"><OutliersAxis /></Look>
  </Frame>
);

const Funnel = () => (
  <Frame answer="Слабее всего переход в договор: до него доходит чуть больше половины предложений. До оплаты добирается примерно каждый седьмой лид." question="Покажи воронку продаж за год" title="Воронка продаж">
    <Look name="Воронка" note="по центру, как принято" tag="А"><FunnelCentered /></Look>
    <Look name="Лесенка" note="слева, с шагами справа" tag="Б"><FunnelStairs /></Look>
  </Frame>
);

const Composition = () => (
  <Frame answer="Почти половина выручки приходится на трёх клиентов; остальные восемь вместе дают меньше половины." question="Из чего складывается выручка по клиентам?" title="Состав выручки по клиентам">
    <Look name="Кольцо" note="как круговая диаграмма графика" tag="А"><CompositionDonut /></Look>
    <Look name="Полоса" note="одна линия, любые подписи" tag="Б"><CompositionBar /></Look>
  </Frame>
);

const MetricsFormsPage = () => (
  <Picker
    variants={[
      { Component: of(Movers), name: "Кто вырос" },
      { Component: of(Pareto), name: "Парето" },
      { Component: of(Outliers), name: "Выбросы" },
      { Component: of(Funnel), name: "Воронка" },
      { Component: of(Composition), name: "Состав" },
    ]}
  />
);

export default MetricsFormsPage;
