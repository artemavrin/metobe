"use client";

// Model editor prototype: real rows from the dev Gateway source (prices per 1 token, as the Gateway reports them)
// and one Yandex model without a price — the case where the admin types it.
import { Badge } from "@metobe/ui/components/reui/badge";
import { Switch } from "@metobe/ui/components/switch";
import { cn } from "@metobe/ui/lib/utils";
import { Braces, Brain, Eye, Wrench } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { BrandLogo } from "@/components/brand-logo";

export type Cap = "tools" | "vision" | "reasoning" | "structured";
export type Caps = Record<Cap, boolean | null>;
export interface Prices {
  input: string | null;
  output: string | null;
  cacheRead: string | null;
  cacheWrite: string | null;
  unit: number;
  currency: "USD" | "RUB";
}
export interface Model {
  id: string;
  title: string;
  maker: { title: string; logo: string };
  context: number | null;
  released: string | null;
  caps: Caps;
  manual: boolean;
  prices: Prices | null;
  /** The Gateway reports prices; a refresh of the list updates them. */
  priceFromSource: boolean;
  enabled: boolean;
}

const gw = (m: Omit<Model, "manual" | "priceFromSource" | "enabled">): Model => ({
  ...m,
  enabled: false,
  manual: false,
  priceFromSource: true,
});

export const MODELS: Model[] = [
  gw({
    caps: { reasoning: true, structured: true, tools: true, vision: true },
    context: 1_000_000,
    id: "anthropic/claude-sonnet-4.5",
    maker: { logo: "anthropic", title: "Anthropic" },
    prices: { cacheRead: "0.0000003", cacheWrite: "0.00000375", currency: "USD", input: "0.000003", output: "0.000015", unit: 1 },
    released: "2025-09-29",
    title: "Claude Sonnet 4.5",
  }),
  gw({
    caps: { reasoning: true, structured: true, tools: true, vision: true },
    context: 400_000,
    id: "openai/gpt-5",
    maker: { logo: "openai", title: "OpenAI" },
    prices: { cacheRead: "0.000000125", cacheWrite: null, currency: "USD", input: "0.00000125", output: "0.00001", unit: 1 },
    released: "2025-08-07",
    title: "GPT-5",
  }),
  gw({
    caps: { reasoning: true, structured: true, tools: true, vision: true },
    context: 1_000_000,
    id: "google/gemini-2.5-flash",
    maker: { logo: "google", title: "Google" },
    prices: { cacheRead: "0.00000003", cacheWrite: null, currency: "USD", input: "0.0000003", output: "0.0000025", unit: 1 },
    released: "2025-03-20",
    title: "Gemini 2.5 Flash",
  }),
  gw({
    caps: { reasoning: false, structured: false, tools: true, vision: false },
    context: 128_000,
    id: "deepseek/deepseek-v3.2",
    maker: { logo: "deepseek", title: "DeepSeek" },
    prices: { cacheRead: null, cacheWrite: null, currency: "USD", input: "0.00000062", output: "0.00000185", unit: 1 },
    released: "2025-12-01",
    title: "DeepSeek V3.2",
  }),
  {
    caps: { reasoning: null, structured: null, tools: true, vision: null },
    context: null,
    enabled: false,
    id: "aliceai-llm",
    maker: { logo: "yandex", title: "Яндекс" },
    manual: false,
    priceFromSource: false,
    prices: null,
    released: null,
    title: "Alice AI LLM",
  },
];

export const CAPS: { key: Cap; icon: typeof Wrench; label: string }[] = [
  { icon: Wrench, key: "tools", label: "Инструменты" },
  { icon: Eye, key: "vision", label: "Изображения" },
  { icon: Brain, key: "reasoning", label: "Рассуждения" },
  { icon: Braces, key: "structured", label: "Структурированный ответ" },
];

export const UNITS = [
  { label: "1", value: 1 },
  { label: "1K", value: 1000 },
  { label: "1M", value: 1_000_000 },
];

/**
 * A price per `from` tokens as the same price per `to` tokens, exactly: the units are powers of ten, so this only
 * moves the decimal point — no floating point, no rounding. 0.0000008 per 1 → 0.8 per 1M.
 */
export const convert = (value: string, from: number, to: number) => {
  const shift = Math.round(Math.log10(to / from));
  if (!/^\d*\.?\d*$/u.test(value) || value === "") {
    return value;
  }
  const [int = "", frac = ""] = value.split(".");
  const digits = `${int}${frac}`;
  let point = int.length + shift;
  let d = digits;
  if (point < 0) {
    d = "0".repeat(-point) + d;
    point = 0;
  }
  if (point > d.length) {
    d += "0".repeat(point - d.length);
  }
  const whole = d.slice(0, point).replace(/^0+(?=\d)/u, "") || "0";
  const fraction = d.slice(point).replace(/0+$/u, "");
  return fraction ? `${whole}.${fraction}` : whole;
};

export const SYMBOL = { RUB: "₽", USD: "$" };

/** «$3 / $15» per 1M, the way price lists read. */
export const priceLine = (p: Prices | null) => {
  if (!p || (p.input === null && p.output === null)) {
    return null;
  }
  const s = SYMBOL[p.currency];
  const per = (v: string | null) => (v === null ? "—" : `${s}${convert(v, p.unit, 1_000_000)}`);
  return `${per(p.input)} / ${per(p.output)}`;
};

export const contextLabel = (n: number | null) =>
  n === null ? null : n >= 1_000_000 ? `${n / 1_000_000}M` : `${Math.round(n / 1000)}K`;

/** The four icons, read-only; `null` is drawn with a dashed outline («не проверено»). */
export const CapIcons = ({ caps, manual }: { caps: Caps; manual?: boolean }) => (
  <span className="relative inline-flex items-center gap-1">
    {manual && <span aria-hidden className="bg-primary absolute -top-0.5 -right-1 size-1.5 rounded-full" />}
    {CAPS.map(({ icon: Icon, key }) => (
      <span
        className={cn(
          "inline-flex size-5 items-center justify-center rounded",
          caps[key] === true && "text-foreground",
          caps[key] === false && "text-muted-foreground/30",
          caps[key] === null && "text-muted-foreground outline-muted-foreground/40 outline-1 outline-dashed"
        )}
        key={key}
      >
        <Icon className="size-3.5" />
      </span>
    ))}
  </span>
);

/**
 * The models list around the editor (the real screen's rows): `editor` renders under the open row, `onOpen` lets a
 * variant open something else instead (a sheet).
 */
export const ModelsFrame = ({
  editor,
  onOpen,
  models,
}: {
  models: Model[];
  editor?: (m: Model, close: () => void) => ReactNode;
  onOpen?: (m: Model) => void;
}) => {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="bg-background min-h-dvh">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 pt-10 pb-32 text-sm md:px-10">
        <h2 className="text-sm font-semibold">
          Модели <span className="text-muted-foreground ml-2 font-normal">0 из {models.length} в чате</span>
        </h2>
        <div className="overflow-hidden rounded-lg border">
          <ul className="divide-y">
            {models.map((m) => {
              const price = priceLine(m.prices);
              const context = contextLabel(m.context);
              const toggle = () => (onOpen ? onOpen(m) : setOpen(open === m.id ? null : m.id));
              return (
                <li key={m.id}>
                  <div className="flex items-center gap-3 py-2 pr-4 pl-4">
                    <BrandLogo label={m.maker.title} logo={m.maker.logo} size={22} />
                    <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={toggle} type="button">
                      <span className="truncate font-medium">{m.title}</span>
                      {m.released && m.released > "2025-07-01" && (
                        <Badge size="sm" variant="info-light">
                          новая
                        </Badge>
                      )}
                    </button>
                    <button className="hidden rounded-md p-0.5 hover:bg-muted md:inline-flex" onClick={toggle} type="button">
                      <CapIcons caps={m.caps} manual={m.manual} />
                    </button>
                    <span className="text-muted-foreground hidden w-12 text-right text-xs tabular-nums sm:inline">{context}</span>
                    <button
                      className="text-muted-foreground hover:text-foreground w-28 truncate text-right text-xs tabular-nums"
                      onClick={toggle}
                      type="button"
                    >
                      {price ?? "цена не задана"}
                    </button>
                    <Switch aria-label={m.title} size="sm" />
                  </div>
                  {open === m.id && editor?.(m, () => setOpen(null))}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
};

/** Shows «Сохранено» for a moment after an autosave. */
export const useSavedFlash = () => {
  const [at, setAt] = useState(0);
  return {
    flash: () => setAt(Date.now()),
    shown: (ms = 1500) => Date.now() - at < ms,
    tick: at,
  };
};
