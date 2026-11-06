"use client";

import { cn } from "@metobe/ui/lib/utils";
import { useEffect, useState } from "react";

import { Picker } from "../_shared/picker";
import { AgentFigure } from "./agent-figure";

// Лицо агента — «Юнит», маленький настольный робот (Hairline, spikes/hairline-agents/unit.js; раунд с «Бобом», «Котиком»
// и «Роботом» отвергнут). Глаза ведут, голова догоняет курсор, моргает, при наведении на лицо улыбается ^ ^. Цвет агента —
// его свет: тёмный экран, светящиеся глаза, лампа на антенне, полоска на подставке. Кружки меняют цвет, первый — без
// цвета (пока агент собирается); ниже — он же в карточке.

const COLORS = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `var(--chart-${n})`);

const Mounted = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? children : null;
};

const Stage = ({ name }: { name: string }) => {
  const [color, setColor] = useState<string | null>(COLORS[6] ?? null);
  return (
    <main className="bg-background text-foreground flex min-h-dvh flex-col items-center justify-center gap-10 px-6 py-24">
      <AgentFigure className="w-[min(30rem,90vw)]" color={color ?? undefined} />
      <div aria-label="Цвет агента" className="flex flex-wrap items-center justify-center gap-2" role="radiogroup">
        <button
          aria-checked={color === null}
          aria-label="Без цвета"
          className={cn("border-border size-6 rounded-full border-2 border-dashed ring-offset-2 ring-offset-background transition-[box-shadow,transform] duration-150 active:scale-90", color === null && "ring-foreground ring-2")}
          onClick={() => setColor(null)}
          role="radio"
          type="button"
        />
        {COLORS.map((c, i) => (
          <button
            aria-checked={c === color}
            aria-label={`Цвет ${i + 1}`}
            className={cn("size-6 rounded-full ring-offset-2 ring-offset-background transition-[box-shadow,transform] duration-150 active:scale-90", c === color && "ring-2")}
            key={c}
            onClick={() => setColor(c)}
            role="radio"
            style={{ "--tw-ring-color": c, background: c } as React.CSSProperties}
            type="button"
          />
        ))}
      </div>
      {/* Как в карточке агента в чате: фигура слева, имя справа. */}
      <div className="bg-card flex w-full max-w-md items-center gap-4 rounded-2xl border p-3 shadow-xs">
        <AgentFigure className="w-32 shrink-0" color={color ?? undefined} />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-2 font-medium">
            {color && <span className="size-2 rounded-full" style={{ background: color }} />}
            {name}
          </span>
          <span className="text-muted-foreground text-sm">По будням в 9:00 · первый — завтра</span>
        </div>
      </div>
    </main>
  );
};

const AgentFacePrototypePage = () => (
  <Picker
    variants={[{ Component: () => <Mounted><Stage name="Письма, которым нужен ответ" /></Mounted>, name: "Юнит", pickerTop: true }]}
  />
);

export default AgentFacePrototypePage;
