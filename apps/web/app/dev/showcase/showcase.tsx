"use client";

import { Button } from "@purr/ui/components/button";
import { ChartBar as BarChartExample } from "@purr/ui/components/examples/c-chart-2";
import { Pattern as AreaChartExample } from "@purr/ui/components/examples/c-chart-13";
import { Pattern as LineChartExample } from "@purr/ui/components/examples/c-chart-17";
import { Pattern as DonutChartExample } from "@purr/ui/components/examples/c-chart-19";
import { Pattern as DataGridExample } from "@purr/ui/components/examples/c-data-grid-34";
import { Badge } from "@purr/ui/components/reui/badge";
import { useTheme } from "next-themes";
import { useState } from "react";

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
            ReUI + shadcn, графики ReUI на recharts. Только в режиме разработки.
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

      <Section title="Графики — ReUI">
        <div className="grid gap-6 md:grid-cols-2" key={replay}>
          <BarChartExample />
          <AreaChartExample />
          <LineChartExample />
          <DonutChartExample />
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
