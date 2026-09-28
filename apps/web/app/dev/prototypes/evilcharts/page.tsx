"use client";

import { EChartsAreaChart } from "@metobe/ui/components/evilcharts/charts/echarts-area-chart";
import { EChartsBarChart } from "@metobe/ui/components/evilcharts/charts/echarts-bar-chart";
import { EChartsComposedChart } from "@metobe/ui/components/evilcharts/charts/echarts-composed-chart";
import { EChartsLineChart } from "@metobe/ui/components/evilcharts/charts/echarts-line-chart";
import { EChartsPieChart } from "@metobe/ui/components/evilcharts/charts/echarts-pie-chart";
import { EChartsRadarChart } from "@metobe/ui/components/evilcharts/charts/echarts-radar-chart";
import { EChartsRadialChart } from "@metobe/ui/components/evilcharts/charts/echarts-radial-chart";
import type { ChartConfig } from "@metobe/ui/components/evilcharts/ui/echarts-chart";
import { Button } from "@metobe/ui/components/button";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

// Spike S9 · графики evilcharts (ECharts) на наших данных и наших цветах темы. Витрина, не выбор: смотрим, как
// они выглядят рядом с нашими, как ведут себя при потоковых точках и сколько весят. Цвета — переменные темы
// `--chart-1…5`, поэтому светлая и тёмная темы работают без правки.

const c = (n: number) => ({ dark: [`var(--chart-${n})`], light: [`var(--chart-${n})`] });

const MONTHS = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен"];
const sales = MONTHS.map((month, i) => ({
  marketplaces: 180 + i * 40 + (i % 3) * 25,
  month,
  retail: 220 - i * 6 + (i % 2) * 18,
  site: 300 + i * 25 + (i % 4) * 30,
}));
const salesConfig = {
  marketplaces: { colors: c(2), label: "Маркетплейсы" },
  retail: { colors: c(3), label: "Розница" },
  site: { colors: c(1), label: "Сайт" },
} satisfies ChartConfig;

const cities = [
  { city: "Москва", staff: 412 },
  { city: "Казань", staff: 96 },
  { city: "Новосибирск", staff: 71 },
  { city: "Екатеринбург", staff: 58 },
  { city: "Самара", staff: 33 },
];
const cityConfig = {
  Екатеринбург: { colors: c(4), label: "Екатеринбург" },
  Казань: { colors: c(2), label: "Казань" },
  Москва: { colors: c(1), label: "Москва" },
  Новосибирск: { colors: c(3), label: "Новосибирск" },
  Самара: { colors: c(5), label: "Самара" },
  staff: { label: "Сотрудники" },
} satisfies ChartConfig;

const money = MONTHS.map((month, i) => ({
  margin: 24 + (i % 4) * 3 + i,
  month,
  revenue: 1200 + i * 140 + (i % 3) * 90,
}));
const moneyConfig = {
  margin: { colors: c(3), label: "Маржа, %" },
  revenue: { colors: c(1), label: "Выручка, тыс. ₽" },
} satisfies ChartConfig;

const skills = [
  { area: "Продажи", plan: 86, fact: 72 },
  { area: "Склад", plan: 70, fact: 81 },
  { area: "Сервис", plan: 64, fact: 58 },
  { area: "Закупки", plan: 78, fact: 69 },
  { area: "Логистика", plan: 82, fact: 88 },
];
const skillConfig = {
  fact: { colors: c(2), label: "Факт" },
  plan: { colors: c(1), label: "План" },
} satisfies ChartConfig;

const Card = ({ title, note, children }: { title: string; note?: string; children: ReactNode }) => (
  <section className="bg-card flex min-w-0 flex-col gap-3 rounded-xl border p-4">
    <div>
      <h2 className="text-sm font-semibold">{title}</h2>
      {note && <p className="text-muted-foreground text-xs">{note}</p>}
    </div>
    <div className="h-64 min-w-0">{children}</div>
  </section>
);

/** Точки приходят по одной, как пишет модель: проверяем, что график не дёргается и не моргает. */
const Streaming = () => {
  const [n, setN] = useState(2);
  const [run, setRun] = useState(0);
  useEffect(() => {
    setN(2);
    const t = setInterval(() => setN((v) => (v >= sales.length ? v : v + 1)), 450);
    return () => clearInterval(t);
  }, [run]);
  return (
    <Card note="Точки по одной каждые 450 мс, анимация выключена" title="Потоковые точки (как пишет модель)">
      <div className="flex h-full flex-col gap-2">
        <div className="min-h-0 flex-1">
          <EChartsAreaChart className="h-full" animation={false} config={salesConfig} data={sales.slice(0, n)} stackType="stacked" xDataKey="month">
            <EChartsAreaChart.Grid />
            <EChartsAreaChart.XAxis dataKey="month" />
            <EChartsAreaChart.Tooltip />
            <EChartsAreaChart.Area dataKey="site" variant="gradient" />
            <EChartsAreaChart.Area dataKey="marketplaces" variant="gradient" />
            <EChartsAreaChart.Area dataKey="retail" variant="gradient" />
          </EChartsAreaChart>
        </div>
        <Button onClick={() => setRun((v) => v + 1)} size="sm" variant="outline">
          Ещё раз
        </Button>
      </div>
    </Card>
  );
};

const EvilChartsPage = () => (
  <main className="bg-background text-foreground mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8">
    <header>
      <h1 className="text-xl font-semibold">Графики evilcharts (ECharts)</h1>
      <p className="text-muted-foreground text-sm">
        Семь видов на наших данных и цветах темы. Светлая и тёмная тема — переключателем системы.
      </p>
    </header>
    <div className="grid gap-4 md:grid-cols-2">
      <Card note="Градиент, точки, клик по легенде выделяет ряд" title="Площадь · с накоплением">
        <EChartsAreaChart className="h-full" config={salesConfig} data={sales} stackType="stacked" xDataKey="month">
          <EChartsAreaChart.Grid />
          <EChartsAreaChart.XAxis dataKey="month" />
          <EChartsAreaChart.Tooltip />
          <EChartsAreaChart.Legend isClickable />
          <EChartsAreaChart.Area dataKey="site" variant="gradient">
            <EChartsAreaChart.Dot variant="border" />
          </EChartsAreaChart.Area>
          <EChartsAreaChart.Area dataKey="marketplaces" variant="gradient">
            <EChartsAreaChart.Dot variant="border" />
          </EChartsAreaChart.Area>
          <EChartsAreaChart.Area dataKey="retail" variant="gradient">
            <EChartsAreaChart.Dot variant="border" />
          </EChartsAreaChart.Area>
        </EChartsAreaChart>
      </Card>
      <Card note="Свечение линии, подсветка ряда под курсором" title="Линия">
        <EChartsLineChart className="h-full" config={salesConfig} enableHoverHighlight data={sales}>
          <EChartsLineChart.Line dataKey="site" glowing isClickable />
          <EChartsLineChart.Line dataKey="marketplaces" glowing isClickable />
          <EChartsLineChart.XAxis dataKey="month" />
          <EChartsLineChart.Tooltip />
          <EChartsLineChart.Legend isClickable />
        </EChartsLineChart>
      </Card>
      <Card note="Скруглённые столбики, градиент" title="Столбцы">
        <EChartsBarChart className="h-full" config={salesConfig} data={sales} layout="vertical">
          <EChartsBarChart.XAxis dataKey="month" />
          <EChartsBarChart.Bar dataKey="site" isClickable />
          <EChartsBarChart.Bar dataKey="marketplaces" isClickable />
          <EChartsBarChart.Legend isClickable />
          <EChartsBarChart.Tooltip />
        </EChartsBarChart>
      </Card>
      <Card note="Столбцы и линия на одной сетке" title="Составной">
        <EChartsComposedChart className="h-full" config={moneyConfig} data={money} xDataKey="month">
          <EChartsComposedChart.Grid />
          <EChartsComposedChart.XAxis dataKey="month" />
          <EChartsComposedChart.Bar dataKey="revenue" />
          <EChartsComposedChart.Line dataKey="margin">
            <EChartsComposedChart.Dot variant="default" />
          </EChartsComposedChart.Line>
          <EChartsComposedChart.Tooltip />
          <EChartsComposedChart.Legend />
        </EChartsComposedChart>
      </Card>
      <Card note="План и факт по направлениям" title="Радар">
        <EChartsRadarChart className="h-full" config={skillConfig} data={skills}>
          <EChartsRadarChart.PolarGrid />
          <EChartsRadarChart.PolarAngleAxis dataKey="area" />
          <EChartsRadarChart.Radar dataKey="plan" variant="filled" />
          <EChartsRadarChart.Radar dataKey="fact" variant="filled" />
          <EChartsRadarChart.Legend />
          <EChartsRadarChart.Tooltip />
        </EChartsRadarChart>
      </Card>
      <Card note="Кольцо со скруглёнными долями" title="Круговая">
        <EChartsPieChart className="h-full" config={cityConfig} data={cities} dataKey="staff" nameKey="city">
          <EChartsPieChart.Legend isClickable />
          <EChartsPieChart.Tooltip />
          <EChartsPieChart.Pie cornerRadius={8} innerRadius={56} isClickable paddingAngle={4}>
            <EChartsPieChart.Label />
          </EChartsPieChart.Pie>
        </EChartsPieChart>
      </Card>
      <Card note="Концентрические кольца, длина дуги — значение" title="Радиальная">
        <EChartsRadialChart className="h-full" config={cityConfig} data={cities} nameKey="city" variant="full">
          <EChartsRadialChart.Legend isClickable />
          <EChartsRadialChart.Tooltip />
          <EChartsRadialChart.RadialBar dataKey="staff" isClickable />
        </EChartsRadialChart>
      </Card>
      <Streaming />
    </div>
  </main>
);

export default EvilChartsPage;
