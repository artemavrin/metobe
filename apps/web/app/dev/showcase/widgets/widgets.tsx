"use client";

import { AnswerChart } from "@/components/chat/answer-chart";
import { AnswerMetrics } from "@/components/chat/answer-metrics";
import { AnswerTable } from "@/components/chat/answer-table";
import type { ChartPart, MetricsPart, TablePart } from "@/lib/answer-work";

// The table and the chart the model builds `from` a tool result (ARCH §9.2), as the chat draws them: while the server
// takes the numbers, with them, cut at the table's most, and when the source could not give what was asked. The
// numbers are invented for the look.

const MONTHS = [
  "2026-01-01",
  "2026-02-01",
  "2026-03-01",
  "2026-04-01",
  "2026-05-01",
  "2026-06-01",
];

const chartInput = {
  from: { bucket: "month", x: "Дата" },
  kind: "area",
  series: [{ field: "Выручка", label: "Выручка", unit: "₽" }],
  title: "Выручка по месяцам",
  x: { label: "Месяц", type: "date" },
} as const;

const chart = (state: Partial<ChartPart>): ChartPart =>
  ({
    input: chartInput,
    toolCallId: "c",
    type: "tool-show_chart",
    ...state,
  }) as ChartPart;

const tableInput = {
  columns: [
    { field: "Товар", label: "Товар", type: "text" },
    {
      field: "Выручка",
      heat: "scale",
      label: "Выручка",
      summary: "sum",
      type: "number",
    },
    {
      field: "Количество",
      label: "Количество",
      summary: "sum",
      type: "number",
    },
  ],
  from: { limit: 500, sort: { desc: true, field: "Выручка" } },
  title: "Товары по выручке",
} as const;

const rows = Array.from({ length: 500 }, (_, i) => [
  `Товар ${i + 1}`,
  81_760_813 - i * 150_000,
  1000 - i,
]);

const table = (state: Partial<TablePart>): TablePart =>
  ({
    input: tableInput,
    toolCallId: "t",
    type: "tool-show_table",
    ...state,
  }) as TablePart;

const metricsInput = {
  items: [
    { field: "Выручка", form: "trend", label: "Выручка", unit: "₽", x: "Дата" },
  ],
  title: "Продажи за 2026 год",
};

const series = MONTHS.map((x, i) => ({
  value: 9_000_000 + i * 1_400_000 + (i % 2) * 600_000,
  x,
}));
const total = series.reduce((a, p) => a + p.value, 0);

const metricsOutput = {
  items: [
    {
      aggregate: "sum",
      bucket: "month",
      delta: {
        change: 8.4,
        current: series[5]?.value ?? 0,
        from: MONTHS[4] ?? "",
        good: "up",
        previous: series[4]?.value ?? 0,
        to: MONTHS[5] ?? "",
      },
      field: "Выручка",
      form: "trend",
      label: "Выручка",
      series,
      unit: "₽",
      value: total,
    },
    {
      aggregate: "distinct",
      field: "Клиент",
      form: "value",
      label: "Клиентов",
      value: 12,
    },
    {
      aggregate: "sum",
      field: "Выручка",
      form: "goal",
      label: "План выручки",
      target: 80_000_000,
      unit: "₽",
      value: total,
    },
    {
      by: "Клиент",
      field: "Выручка",
      form: "share",
      label: "Доля трёх крупнейших клиентов",
      names: ["Альфа-Опт", "Берёзка", "ТД Сибирь"],
      value: total * 0.52,
      whole: total,
    },
    {
      field: "Выручка",
      form: "range",
      label: "Разброс суммы накладной",
      range: { avg: 1_360_000, max: 4_400_000, median: 880_000, min: 260_000 },
      unit: "₽",
    },
    {
      by: "Клиент",
      field: "Выручка",
      form: "ranking",
      items: [
        { name: "Альфа-Опт", value: 21_000_000 },
        { name: "Берёзка", value: 12_000_000 },
        { name: "ТД Сибирь", value: 8_000_000 },
      ],
      label: "Клиенты по выручке",
      unit: "₽",
      whole: total,
    },
    {
      facts: [
        { fact: "rows", value: 1242 },
        { fact: "sum", value: total },
        { fact: "avg", value: total / 1242 },
        { fact: "median", value: 880_000 },
      ],
      field: "Выручка",
      form: "summary",
      label: "Сводка по выручке",
      unit: "₽",
    },
  ],
  rows: 1242,
};

const NAMES = [
  "Альфа-Опт",
  "Берёзка",
  "ТД Сибирь",
  "Орион",
  "Кафе «Север»",
  "Восход",
  "Меридиан",
  "Гарант-Трейд",
  "Полюс",
  "Лотос",
  "Кедр",
  "Дельта",
];
const SUMS = [466, 243, 163, 144, 111, 110, 98, 79, 72, 72, 71, 64].map(
  (v) => v * 1_000_000
);
const WHOLE = SUMS.reduce((a, b) => a + b, 0);
const classOf = (before: number) => {
  if (before < 0.8) {
    return "A";
  }
  return before < 0.95 ? "B" : "C";
};
const paretoRows = (() => {
  let acc = 0;
  return NAMES.map((name, i) => {
    const before = acc / WHOLE;
    acc += SUMS[i] ?? 0;
    return {
      cls: classOf(before),
      cum: acc / WHOLE,
      name,
      value: SUMS[i] ?? 0,
    };
  });
})();
// 40 groups for the curve.
const curve = Array.from(
  { length: 40 },
  (_, i) => 1 - (1 - (i + 1) / 40) ** 2.2
);

const storyOutput = {
  items: [
    {
      aggregate: "sum",
      bucket: "month",
      by: "Клиент",
      down: 4,
      field: "Выручка",
      form: "movers",
      good: "up",
      label: "Кто вырос и упал",
      movers: [
        {
          after: 40_000_000,
          before: 19_800_000,
          change: 20_200_000,
          name: "Восход",
          pct: 102,
        },
        {
          after: 30_000_000,
          before: 20_100_000,
          change: 9_900_000,
          name: "Дельта",
          pct: 49,
        },
        {
          after: 21_000_000,
          before: 12_200_000,
          change: 8_800_000,
          name: "Кафе «Север»",
          pct: 72,
        },
        {
          after: 15_000_000,
          before: 8_500_000,
          change: 6_500_000,
          name: "Кедр",
          pct: 76,
        },
        {
          after: 9_000_000,
          before: 12_200_000,
          change: -3_200_000,
          name: "Орион",
          pct: -26,
        },
        {
          after: 11_000_000,
          before: 13_900_000,
          change: -2_900_000,
          name: "ТД Сибирь",
          pct: -21,
        },
        {
          after: 6_000_000,
          before: 7_900_000,
          change: -1_900_000,
          name: "Гарант-Трейд",
          pct: -24,
        },
        {
          after: 80_000_000,
          before: 80_140_000,
          change: -140_000,
          name: "Альфа-Опт",
          pct: -0.2,
        },
      ],
      net: 50_900_000,
      period: { from: "2026-08-01", to: "2026-09-01" },
      unit: "₽",
      up: 8,
    },
    {
      aggregate: "sum",
      by: "Клиент",
      classes: [
        { cls: "A", count: 8, share: 0.84 },
        { cls: "B", count: 3, share: 0.13 },
        { cls: "C", count: 1, share: 0.04 },
      ],
      curve: paretoRows.map((p) => p.cum),
      field: "Выручка",
      form: "pareto",
      groupCount: 12,
      label: "ABC-анализ клиентов",
      n80: 8,
      pareto: paretoRows,
      unit: "₽",
      whole: WHOLE,
    },
    {
      aggregate: "sum",
      by: "Товар",
      classes: [
        { cls: "A", count: 9, share: 0.8 },
        { cls: "B", count: 8, share: 0.15 },
        { cls: "C", count: 23, share: 0.05 },
      ],
      curve,
      field: "Выручка",
      form: "pareto",
      groupCount: 40,
      label: "ABC-анализ товаров",
      n80: 9,
      pareto: paretoRows,
      unit: "₽",
      whole: WHOLE,
    },
    {
      by: "Клиент",
      count: 1249,
      fence: 4_600_000,
      field: "Выручка",
      form: "outliers",
      label: "Выбросы по сумме накладной",
      outlierCount: 7,
      outliers: [
        { date: "2026-03-12", name: "Альфа-Опт", value: 14_800_000 },
        { date: "2026-05-27", name: "ТД Сибирь", value: 11_200_000 },
        { date: "2026-06-18", name: "Восход", value: 9_600_000 },
      ],
      quartiles: {
        max: 14_800_000,
        median: 885_000,
        q1: 420_000,
        q3: 1_900_000,
      },
      unit: "₽",
      values: [
        ...Array.from(
          { length: 300 },
          (_, i) => 260_000 + ((i * 7919) % 4_300_000)
        ),
        14_800_000,
        11_200_000,
        9_600_000,
        8_900_000,
        7_400_000,
        6_100_000,
        5_300_000,
      ],
    },
    {
      aggregate: "sum",
      by: "Клиент",
      field: "Выручка",
      form: "composition",
      label: "Состав выручки",
      parts: [
        { name: "Альфа-Опт", value: 466_000_000 },
        { name: "Берёзка", value: 243_000_000 },
        { name: "ТД Сибирь", value: 163_000_000 },
        { name: "Орион", value: 144_000_000 },
        { count: 8, name: "", rest: true, value: 676_000_000 },
      ],
      unit: "₽",
      whole: 1_692_000_000,
    },
  ],
  rows: 1249,
};

const metrics = (state: Partial<MetricsPart>): MetricsPart =>
  ({
    input: metricsInput,
    toolCallId: "m",
    type: "tool-show_metrics",
    ...state,
  }) as MetricsPart;

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className="flex flex-col gap-3">
    <h2 className="text-muted-foreground text-sm font-medium tracking-wider uppercase">
      {title}
    </h2>
    {children}
  </section>
);

export const Widgets = () => (
  <main className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-10">
    <h1 className="text-2xl font-semibold">Виджеты из результата тула</h1>
    <Section title="Показатели: сервер считает">
      <AnswerMetrics part={metrics({ state: "input-available" })} />
    </Section>
    <Section title="Показатели: готово">
      <AnswerMetrics
        part={metrics({
          output: metricsOutput,
          state: "output-available",
        } as Partial<MetricsPart>)}
      />
    </Section>
    <Section title="Показатели: что произошло (кто вырос, ABC, выбросы, состав)">
      <AnswerMetrics
        part={metrics({
          input: { items: [], title: "Продажи: что произошло" },
          output: storyOutput,
          state: "output-available",
        } as unknown as Partial<MetricsPart>)}
      />
    </Section>
    <Section title="Показатели: источник не отдал, что просили">
      <AnswerMetrics
        part={metrics({
          errorText:
            'items[2].field: there is no column "Сумма" in the result. Columns: Номер, Дата, Клиент, Выручка.',
          state: "output-error",
        })}
      />
    </Section>
    <Section title="График: сервер собирает точки">
      <AnswerChart part={chart({ state: "input-available" })} />
    </Section>
    <Section title="График: точки из результата">
      <AnswerChart
        part={chart({
          output: {
            data: MONTHS.map((m, i) => [
              m,
              9_000_000 + i * 1_400_000 + (i % 2) * 600_000,
            ]),
            points: MONTHS.length,
          },
          state: "output-available",
        })}
      />
    </Section>
    <Section title="График: источник не отдал, что просили">
      <AnswerChart
        part={chart({
          errorText:
            'from.x: there is no column "Месяц" in the result. Columns: Товар, Дата, Выручка.',
          state: "output-error",
        })}
      />
    </Section>
    <Section title="Таблица: сервер берёт строки">
      <AnswerTable part={table({ state: "input-available" })} />
    </Section>
    <Section title="Таблица: 500 из 2 938">
      <AnswerTable
        part={table({
          output: { data: rows, rows: 500, total: 2938 },
          state: "output-available",
        })}
      />
    </Section>
    <Section title="Таблица: источник не отдал, что просили">
      <AnswerTable
        part={table({
          errorText:
            'columns[1].field: there is no column "Прибыль" in the result. Columns: Товар, Выручка, Количество.',
          state: "output-error",
        })}
      />
    </Section>
  </main>
);
