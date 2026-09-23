"use client";

import { Button } from "@purr/ui/components/button";
import { EvilAreaChart } from "@purr/ui/components/evilcharts/charts/recharts-area-chart";
import { EvilBarChart } from "@purr/ui/components/evilcharts/charts/recharts-bar-chart";
import { Pattern as DataGridExample } from "@purr/ui/components/examples/c-data-grid-34";
import { Badge } from "@purr/ui/components/reui/badge";
import { useTheme } from "next-themes";
import { useState } from "react";

const revenue = [
  { costs: 80, month: "Янв", revenue: 186 },
  { costs: 200, month: "Фев", revenue: 305 },
  { costs: 120, month: "Мар", revenue: 237 },
  { costs: 190, month: "Апр", revenue: 273 },
  { costs: 130, month: "Май", revenue: 209 },
  { costs: 140, month: "Июн", revenue: 314 },
];

const chartConfig = {
  costs: {
    colors: { dark: ["#f59e0b"], light: ["#d97706"] },
    label: "Расходы",
  },
  revenue: {
    colors: { dark: ["#34d399", "#22d3ee"], light: ["#059669", "#0891b2"] },
    label: "Выручка",
  },
};

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className="flex flex-col gap-4">
    <h2 className="text-muted-foreground text-sm font-medium tracking-wider uppercase">
      {title}
    </h2>
    {children}
  </section>
);

export const Showcase = () => {
  const { resolvedTheme, setTheme } = useTheme();
  // Remounting the charts replays their intro animation.
  const [replay, setReplay] = useState(0);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-12 px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Витрина Purr</h1>
          <p className="text-muted-foreground text-sm">
            ReUI + shadcn, графики EvilCharts. Только в режиме разработки.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setReplay((n) => n + 1)} variant="outline">
            Повторить анимацию
          </Button>
          <Button
            onClick={() =>
              setTheme(resolvedTheme === "dark" ? "light" : "dark")
            }
            variant="outline"
          >
            {resolvedTheme === "dark" ? "Светлая тема" : "Тёмная тема"}
          </Button>
        </div>
      </header>

      <Section title="Графики — EvilCharts">
        <div className="grid gap-8 md:grid-cols-2" key={replay}>
          <div className="h-72">
            <EvilAreaChart config={chartConfig} data={revenue} xDataKey="month">
              <EvilAreaChart.Grid />
              <EvilAreaChart.XAxis dataKey="month" />
              <EvilAreaChart.Tooltip />
              <EvilAreaChart.Area dataKey="revenue" />
              <EvilAreaChart.Area dataKey="costs" variant="hatched" />
              <EvilAreaChart.Legend />
            </EvilAreaChart>
          </div>
          <div className="h-72">
            <EvilBarChart config={chartConfig} data={revenue}>
              <EvilBarChart.Grid />
              <EvilBarChart.XAxis dataKey="month" />
              <EvilBarChart.Tooltip />
              <EvilBarChart.Bar dataKey="revenue" glowing />
              <EvilBarChart.Bar dataKey="costs" />
            </EvilBarChart>
          </div>
        </div>
      </Section>

      <Section title="Таблица — ReUI Data Grid">
        <DataGridExample />
      </Section>

      <Section title="Кнопки и бейджи">
        <div className="flex flex-wrap items-center gap-2">
          <Button>Основная</Button>
          <Button variant="secondary">Вторичная</Button>
          <Button variant="outline">Контурная</Button>
          <Button variant="ghost">Призрачная</Button>
          <Button variant="destructive">Удалить</Button>
          <Button variant="link">Ссылка</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>По умолчанию</Badge>
          <Badge variant="success">Работает</Badge>
          <Badge variant="warning">Ждёт</Badge>
          <Badge variant="destructive">Ошибка</Badge>
          <Badge variant="info">Инфо</Badge>
          <Badge variant="outline">Контур</Badge>
        </div>
      </Section>
    </main>
  );
};
