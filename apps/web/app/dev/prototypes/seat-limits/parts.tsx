"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@metobe/ui/components/popover";
import { Progress } from "@metobe/ui/components/progress";
import { Badge } from "@metobe/ui/components/reui/badge";
import { cn } from "@metobe/ui/lib/utils";
import type { ReactNode } from "react";

import { useProto } from "../memory/frame";
import { TIERS, limitsFor, resetWord, tone } from "./data";
import type { Limits, State, Tier } from "./data";

// Общее у вариантов P35: полоса лимита, кольцо, бейдж тарифа, hover-карточка с обеими полосами.

export const useLimits = () => {
  const { knobs } = useProto();
  const tier = knobs.tier as Tier;
  const state = knobs.st as State;
  return { limits: limitsFor(state, tier), state, tier, up: knobs.up as "grey" | "hide" };
};

const FILL = {
  ok: "[&_[data-slot=progress-indicator]]:bg-primary",
  out: "[&_[data-slot=progress-indicator]]:bg-destructive",
  warn: "[&_[data-slot=progress-indicator]]:bg-warning",
} as const;
const TEXT = { ok: "text-muted-foreground", out: "text-destructive", warn: "text-amber-700 dark:text-amber-400" } as const;

export const TierBadge = ({ tier }: { tier: Tier }) => (
  <Badge radius="full" variant={TIERS[tier].badge}>
    {TIERS[tier].title}
  </Badge>
);

/** Полоса: подпись, процент, сброс. `dense` — одна строка для меню и карточки. */
export const LimitBar = ({ label, pct, reset, dense }: { label: string; pct: number; reset: string | null; dense?: boolean }) => {
  const t = tone(pct);
  // Своя дорожка у Progress уже есть — красим её индикатор, сброс пишем под ней.
  return (
    <div className={cn("flex flex-col gap-1.5", dense ? "text-xs" : "text-sm")}>
      <Progress
        aria-label={`${label}: ${pct} %`}
        className={cn("gap-1.5", dense ? "[&_[data-slot=progress-track]]:h-1" : "[&_[data-slot=progress-track]]:h-1.5", FILL[t])}
        value={Math.min(pct, 100)}
      >
        <div className="flex w-full items-baseline justify-between gap-3">
          <span className="font-medium">{label}</span>
          <span className={cn("tabular-nums", t === "ok" ? "text-foreground" : TEXT[t])}>{pct} %</span>
        </div>
      </Progress>
      <span className="text-muted-foreground text-xs">{pct >= 100 ? `Исчерпан, ${resetWord(reset)}` : resetWord(reset).replace(/^с/u, "С")}</span>
    </div>
  );
};

/** Обе полосы тарифа: у Макса окна 5 часов нет. */
export const Bars = ({ limits, dense }: { limits: Limits; dense?: boolean }) => (
  <div className={cn("flex flex-col", dense ? "gap-3" : "gap-5")}>
    {limits.five && <LimitBar dense={dense} label="5 часов" pct={limits.five.pct} reset={limits.five.reset} />}
    <LimitBar dense={dense} label="Неделя" pct={limits.week.pct} reset={limits.week.reset} />
  </div>
);

/** Кольцо по большему из двух процентов. */
export const Ring = ({ pct, size = 20 }: { pct: number; size?: number }) => {
  const r = size / 2 - 2.5;
  const c = 2 * Math.PI * r;
  const t = tone(pct);
  return (
    <svg aria-hidden className="-rotate-90" height={size} viewBox={`0 0 ${size} ${size}`} width={size}>
      <circle className="stroke-muted" cx={size / 2} cy={size / 2} fill="none" r={r} strokeWidth={2.5} />
      <circle
        className={cn(t === "ok" ? "stroke-primary" : t === "warn" ? "stroke-warning" : "stroke-destructive", "transition-[stroke-dashoffset] duration-300")}
        cx={size / 2}
        cy={size / 2}
        fill="none"
        r={r}
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(pct, 100) / 100)}
        strokeLinecap="round"
        strokeWidth={2.5}
      />
    </svg>
  );
};

export const topPct = (l: Limits) => Math.max(l.week.pct, l.five?.pct ?? 0);

/**
 * Hover-карточка по правилам проекта: фон сайдбара, без хвостика, пауза до закрытия, чтобы курсор дошёл; на
 * телефоне — по нажатию.
 */
export const LimitsCard = ({ trigger, tier, limits, side = "top" }: { trigger: ReactNode; tier: Tier; limits: Limits; side?: "top" | "bottom" }) => (
  <Popover>
    <PopoverTrigger closeDelay={200} delay={200} openOnHover render={<button className="rounded-full outline-none focus-visible:ring-2" type="button" />}>
      {trigger}
    </PopoverTrigger>
    <PopoverContent align="end" className="bg-sidebar text-sidebar-foreground w-64 gap-3 rounded-xl p-3 shadow-lg" side={side} sideOffset={8}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">Место</span>
        <TierBadge tier={tier} />
      </div>
      <Bars dense limits={limits} />
    </PopoverContent>
  </Popover>
);
