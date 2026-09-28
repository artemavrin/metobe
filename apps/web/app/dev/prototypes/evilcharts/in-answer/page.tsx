"use client";

import { Button } from "@metobe/ui/components/button";
import { useEffect, useState } from "react";

import { AnswerChart } from "@/components/chat/answer-chart";
import type { ChartPart } from "@/lib/answer-work";

// Графики в ответе, как их рисует чат (AnswerChart): каждый вид, с нашими форматами и палитрой; внизу — как график
// собирается, пока модель пишет точки. Данные — придуманные для просмотра.

const MONTHS = ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01"];
const x = (label: string, type: "category" | "date" | "number" = "category") => ({ label, type });

const money = (n: number) => 1_200_000 + n * 140_000 + (n % 3) * 90_000;

const CHARTS: { name: string; input: Record<string, unknown> }[] = [
  {
    input: {
      kind: "area",
      points: MONTHS.map((d, i) => [d, 300 + i * 25 + (i % 4) * 30, 180 + i * 40 + (i % 3) * 25, 220 - i * 6 + (i % 2) * 18]),
      series: [{ label: "Сайт", unit: "шт." }, { label: "Маркетплейсы", unit: "шт." }, { label: "Розница", unit: "шт." }],
      stacked: true,
      title: "Продажи по каналам",
      x: x("Месяц", "date"),
    },
    name: "Площадь с накоплением, 3 ряда",
  },
  {
    input: {
      kind: "line",
      points: MONTHS.map((d, i) => [d, money(i), money(i) * 0.62 + (i % 2) * 40_000]),
      series: [{ label: "Выручка", unit: "₽" }, { label: "Себестоимость", unit: "₽" }],
      title: "Выручка и себестоимость",
      x: x("Месяц", "date"),
    },
    name: "Линия, деньги",
  },
  {
    input: {
      horizontal: true,
      kind: "bar",
      points: [["Москва", 412], ["Казань", 96], ["Новосибирск", 71], ["Екатеринбург", 58], ["Самара", 33], ["Пермь", 21]],
      series: [{ label: "Сотрудники", unit: "чел." }],
      title: "Сотрудники по городам",
      x: x("Город"),
    },
    name: "Столбцы на боку, рейтинг",
  },
  {
    input: {
      kind: "bar",
      percent: true,
      points: [["Q1", 40, 35, 25], ["Q2", 42, 30, 28], ["Q3", 38, 34, 28], ["Q4", 45, 30, 25]],
      series: [{ label: "Сайт" }, { label: "Маркетплейсы" }, { label: "Розница" }],
      title: "Доли каналов по кварталам",
      x: x("Квартал"),
    },
    name: "Столбцы, доли 100%",
  },
  {
    input: {
      kind: "composed",
      points: MONTHS.map((d, i) => [d, money(i), 1_500_000 + i * 120_000]),
      series: [{ as: "bar", label: "Факт", unit: "₽" }, { as: "line", label: "План", unit: "₽" }],
      title: "Выручка: факт и план",
      x: x("Месяц", "date"),
    },
    name: "Составной: факт столбцами, план линией",
  },
  {
    input: {
      kind: "radar",
      points: [["Продажи", 86, 72], ["Склад", 70, 81], ["Сервис", 64, 58], ["Закупки", 78, 69], ["Логистика", 82, 88]],
      series: [{ label: "План", unit: "%" }, { label: "Факт", unit: "%" }],
      title: "План и факт по направлениям",
      x: x("Направление"),
    },
    name: "Радар, 2 ряда",
  },
  {
    input: {
      donut: true,
      kind: "pie",
      points: [["Москва", 412], ["Казань", 96], ["Новосибирск", 71], ["Екатеринбург", 58], ["Самара", 33], ["Пермь", 21], ["Тюмень", 12], ["Омск", 9], ["Уфа", 6]],
      series: [{ label: "Сотрудники", unit: "чел." }],
      title: "Сотрудники по городам",
      x: x("Город"),
    },
    name: "Круговая, девять долей (восемь цветов)",
  },
  {
    input: {
      kind: "radial",
      points: [["Продажи", 86], ["Склад", 70], ["Сервис", 64], ["Закупки", 78]],
      series: [{ label: "Выполнение плана", unit: "%" }],
      title: "Выполнение плана",
      x: x("Направление"),
    },
    name: "Радиальная, прогресс по направлениям",
  },
];

const part = (state: ChartPart["state"], input: unknown) =>
  ({ input, state, toolCallId: `c-${Math.random()}`, type: "tool-show_chart" }) as ChartPart;

/** Точки по одной, как пишет модель: рамка и оси сразу, точки приходят следом. */
const Streaming = () => {
  const [run, setRun] = useState(0);
  const [n, setN] = useState(0);
  const source = CHARTS[0]?.input as { points: unknown[] };
  useEffect(() => {
    setN(0);
    const t = setInterval(() => setN((v) => (v > source.points.length ? v : v + 1)), 500);
    return () => clearInterval(t);
  }, [run, source.points.length]);
  const done = n > source.points.length;
  // The last written point may be cut, as in the stream: one more than shown is in the input, unfinished.
  const input = { ...CHARTS[0]?.input, points: source.points.slice(0, Math.min(n, source.points.length)) };
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">Сборка по точкам (как пишет модель)</h2>
      <AnswerChart key={run} part={part(done ? "output-available" : "input-streaming", input)} />
      <Button onClick={() => setRun((v) => v + 1)} size="sm" variant="outline">
        Ещё раз
      </Button>
    </section>
  );
};

const InAnswerPage = () => (
  <main className="bg-background text-foreground mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8">
    <header>
      <h1 className="text-xl font-semibold">Графики в ответе</h1>
      <p className="text-muted-foreground text-sm">Как их рисует чат: восемь видов, наши форматы и палитра.</p>
    </header>
    {CHARTS.map((c) => (
      <section className="flex flex-col gap-2" key={c.name}>
        <h2 className="text-muted-foreground text-xs font-medium">{c.name}</h2>
        <AnswerChart part={part("output-available", c.input)} />
      </section>
    ))}
    <Streaming />
  </main>
);

export default InAnswerPage;
