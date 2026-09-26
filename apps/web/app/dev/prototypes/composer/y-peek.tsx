"use client";

// The model peek beside the favorites picker — a rich tooltip: the sidebar's surface (a shade off the white picker,
// so it reads as a second, lighter layer), compact, centred on the row it describes, no tail. A spec sheet, not a
// panel: label, value and — against the chat's model — the RPG-style change, on one grid.
// Desktop: beside the list; phone (long tap): a sheet at the bottom edge.
import { cn } from "@metobe/ui/lib/utils";
import { Brain, Eye, Wrench } from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";

import { type ChatModel, fmtContext, usageOf } from "./data";

const NF = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const NF1 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const money = (v: number, c: "USD" | "RUB") => `${NF.format(v)} ${c === "USD" ? "$" : "₽"}`;

const CAPS = [
  { icon: Eye, key: "vision", long: "Видит картинки" },
  { icon: Wrench, key: "tools", long: "Работает с инструментами" },
  { icon: Brain, key: "reasoning", long: "Умеет размышлять" },
] as const;

/** RPG-style change against the chat's model: ▲/▼ says the value went up or down, colour says better or worse. */
type Delta = { text: string; better: boolean } | null;
const ratio = (a: number | null | undefined, b: number | null | undefined, higherIsBetter: boolean): Delta => {
  if (!a || !b) {
    return null;
  }
  const r = a / b;
  if (Math.abs(r - 1) < 0.1) {
    return null;
  }
  const up = r > 1;
  return { better: up === higherIsBetter, text: `${up ? "▲" : "▼"} ${NF1.format(up ? r : 1 / r)}×` };
};
const seconds = (a: number | null, b: number | null): Delta => {
  if (a === null || b === null || Math.abs(a - b) < 150) {
    return null;
  }
  const up = a > b;
  return { better: !up, text: `${up ? "▲" : "▼"} ${NF1.format(Math.abs(a - b) / 1000)} с` };
};

/**
 * One line of the sheet; when comparing, the change has its own column, so values and changes line up. What it is
 * compared with is not written out — it is the chat's model, the one on the chip; hovering the change names it.
 */
const Spec = ({ label, value, delta, vs }: { label: string; value: string; delta: Delta; vs?: string }) => (
  <div className={cn("grid items-baseline gap-x-2 py-[3px]", vs ? "grid-cols-[minmax(0,1fr)_auto_3.5rem]" : "grid-cols-[minmax(0,1fr)_auto]")}>
    <span className="text-muted-foreground truncate">{label}</span>
    <span className="text-right font-medium tabular-nums">{value}</span>
    {vs && (
      <span
        className={cn("text-right text-[11px] font-semibold tabular-nums", delta && (delta.better ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"))}
        title={delta ? `по сравнению с ${vs}` : undefined}
      >
        {delta?.text}
      </span>
    )}
  </div>
);

/** `vs` — the chat's model: every line shows how this one compares; the chat's model itself shows no changes. */
export const PeekCard = ({ m, vs, className }: { m: ChatModel; vs?: ChatModel; className?: string }) => {
  const u = usageOf(m.id);
  const c = m.price?.currency ?? "USD";
  const other = vs && vs.id !== m.id ? vs : undefined;
  const samePrice = other?.price && m.price && other.price.currency === m.price.currency;
  return (
    <div className={cn("bg-sidebar text-sidebar-foreground ring-foreground/10 w-64 rounded-xl p-3 text-xs shadow-lg ring-1", className)}>
      <div className="flex items-center gap-2">
        <BrandLogo label={m.makerTitle} logo={m.maker} size={24} />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] leading-4 font-semibold tracking-tight">{m.title}</span>
            {/* Capabilities beside the name, as icons like everywhere; missing ones dimmed, so the three keep their places */}
            <span className="ml-auto flex shrink-0 items-center gap-1.5">
              {CAPS.map(({ icon: Icon, key, long }) => {
                const v = m.caps[key];
                return (
                  <span key={key} title={`${long}: ${v === true ? "да" : v === false ? "нет" : "источник не сообщил"}`}>
                    <Icon className={cn("size-3.5", v === true ? "text-foreground/70" : v === null ? "text-foreground/30" : "text-foreground/20")} />
                  </span>
                );
              })}
            </span>
          </div>
          {/* The source's name in full — the caps sit on the title's line only */}
          <span className="text-muted-foreground truncate text-[11px] leading-4">
            {m.makerTitle} · {m.source}
          </span>
        </div>
      </div>

      <div className="bg-border my-2.5 h-px" />

      <Spec delta={other ? ratio(m.context, other.context, true) : null} label="Контекст" value={fmtContext(m.context) ?? "—"} vs={other?.title} />
      <Spec
        delta={other ? seconds(u.firstTokenMs, usageOf(other.id).firstTokenMs) : null}
        label="Первый токен"
        value={u.firstTokenMs === null ? "—" : `${NF1.format(u.firstTokenMs / 1000)} с`}
        vs={other?.title}
      />
      <Spec delta={samePrice ? ratio(m.price?.input, other?.price?.input, false) : null} label="Вход за 1M" value={m.price ? money(m.price.input, c) : "—"} vs={other?.title} />
      <Spec delta={samePrice ? ratio(m.price?.output, other?.price?.output, false) : null} label="Выход за 1M" value={m.price ? money(m.price.output, c) : "—"} vs={other?.title} />
    </div>
  );
};

// Motion by place. Beside the picker: after the delay the card slides out from under its edge (the picker clips its
// first 8px) with a slight scale, 180ms; between rows the content swaps in place and the card glides after the row.
// Above the picker (a narrow window): it rises from it. Phone: a sheet from below the screen's edge on the iOS drawer
// curve, and it leaves with the popover. Opened from the keyboard: no entrance at all.
export const PEEK_CSS = `
.y-peek { transition: transform 120ms cubic-bezier(0.23, 1, 0.32, 1); }
.y-peek-in, .y-peek-up { transition: opacity 120ms cubic-bezier(0.23, 1, 0.32, 1), translate 180ms cubic-bezier(0.23, 1, 0.32, 1), scale 180ms cubic-bezier(0.23, 1, 0.32, 1); }
@starting-style { .y-peek-in { opacity: 0; translate: -16px 0; scale: 0.97; } }
@starting-style { .y-peek-up { opacity: 0; translate: 0 8px; scale: 0.97; } }
.y-peek-sheet { transition: translate 320ms cubic-bezier(0.32, 0.72, 0, 1), opacity 150ms ease; }
@starting-style { .y-peek-sheet { opacity: 0; translate: 0 calc(100% + 24px); } }
.y-peek-sheet[data-closing] { opacity: 0; translate: 0 16px; transition-duration: 100ms; transition-timing-function: cubic-bezier(0.23, 1, 0.32, 1); }
@media (prefers-reduced-motion: reduce) {
  .y-peek { transition: none; }
  .y-peek-in, .y-peek-up, .y-peek-sheet { scale: 1 !important; translate: none !important; transition: opacity 150ms ease; }
}
`;
