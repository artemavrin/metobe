"use client";

import { Button } from "@metobe/ui/components/button";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@metobe/ui/components/input-group";
import { Alert, AlertDescription } from "@metobe/ui/components/reui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@metobe/ui/components/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import { FlaskConical } from "lucide-react";
import type { ReactNode } from "react";

import { MODELS, TARIFF_IDS, money, pct, tariffById } from "../_orgs/data";
import type { TariffId } from "../_orgs/data";
import { TariffBadge } from "../_orgs/frame";
import { usePhone } from "../privacy/frame";
import { forecast, useTariffs } from "./state";
import type { Knobs, MonthForecast, TariffEconomy } from "./state";

// Куски прогноза (ORGS-PLAN §10): следующий месяц целиком и по организациям, тарифы на одно место, «покрутить».
// Пока что-то покручено, рядом с числом — разница с сохранённым; «Применить к тарифу» сохраняет лимиты и НДС.

export const useForecast = () => {
  const s = useTariffs();
  const now = forecast(s.tariffs, s.base);
  const next = forecast(s.tariffs, s.tweak);
  return { next, now, s };
};

const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${money(Math.abs(Math.round(n)))}`;

/** Разница с сохранённым; `good` — в какую сторону хорошо. */
export const Delta = ({ value, good = "up", pctPoints, unit }: { value: number; good?: "up" | "down"; pctPoints?: boolean; unit?: string }) => {
  if (Math.abs(value) < (pctPoints ? 0.05 : 0.5)) return null;
  const better = good === "up" ? value > 0 : value < 0;
  return (
    <span className={cn("text-xs font-medium tabular-nums", better ? "text-success" : "text-destructive")}>
      {pctPoints
        ? `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(1).replace(".", ",")} п. п.`
        : unit
          ? `${value > 0 ? "+" : "−"}${Math.abs(Math.round(value))} ${unit}`
          : signed(value)}
    </span>
  );
};

/** Выручка → НДС → модели → серверы → остаётся; полоса показывает, куда уходит выручка. */
export const MonthBreakdown = ({ f, base, dirty }: { f: MonthForecast; base: MonthForecast; dirty: boolean }) => {
  const lines: [string, number, number, "up" | "down", string?][] = [
    ["Выручка по местам", f.revenue, base.revenue, "up", "без НДС, по ценам организаций"],
    ["Модели", f.models, base.models, "down", "средний расход места за 4 недели × места"],
    ["Серверы", f.servers, base.servers, "down"],
  ];
  const share = (n: number) => `${Math.max(0, (n / f.revenue) * 100)}%`;
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="bg-muted flex h-2.5 overflow-hidden rounded-full">
        <span className="bg-chart-1" style={{ width: share(f.models) }} />
        <span className="bg-foreground/30" style={{ width: share(f.servers) }} />
        <span className="bg-success" style={{ width: share(f.left) }} />
      </div>
      <ul className="flex flex-col gap-2">
        {lines.map(([label, v, b, good, hint], i) => (
          <li className="flex items-baseline justify-between gap-3" key={label}>
            <span className="flex min-w-0 items-center gap-2">
              {i > 0 && <span className={cn("size-2 shrink-0 rounded-full", i === 1 ? "bg-chart-1" : "bg-foreground/30")} />}
              <span className="flex min-w-0 flex-col">
                <span>{i > 0 ? `− ${label}` : label}</span>
                {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
              </span>
            </span>
            <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
              {dirty && <Delta good={good} value={v - b} />}
              {money(Math.round(v))}
            </span>
          </li>
        ))}
        <li className="flex items-baseline justify-between gap-3 border-t pt-2 font-semibold">
          <span className="flex items-center gap-2">
            <span className="bg-success size-2 rounded-full" />
            Остаётся
          </span>
          <span className="flex items-baseline gap-2 tabular-nums">
            {dirty && <Delta value={f.left - base.left} />}
            {money(Math.round(f.left))} · {pct((f.left / f.revenue) * 100)}
          </span>
        </li>
        <li className="text-muted-foreground flex items-baseline justify-between gap-3 text-xs">
          <span>НДС в цене, уходит в бюджет</span>
          <span className="tabular-nums">{money(Math.round(f.vat))}</span>
        </li>
      </ul>
    </div>
  );
};

export const OrgForecast = ({ f }: { f: MonthForecast }) => (
  <div className="overflow-x-auto rounded-lg border">
    <table className="w-full text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
      <thead className="text-muted-foreground bg-muted/40 text-left text-xs">
        <tr>
          <th className="px-4 py-2 font-medium">Организация</th>
          <th className="px-3 py-2 text-right font-medium">Мест</th>
          <th className="px-3 py-2 text-right font-medium">Выручка</th>
          <th className="px-3 py-2 text-right font-medium">Модели</th>
          <th className="px-3 py-2 text-right font-medium">Остаётся</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {f.byOrg.map((o) => (
          <tr key={o.id}>
            <td className="px-4 py-2.5 font-medium">{o.name}</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{o.seats}</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{money(o.revenue)}</td>
            <td className="px-3 py-2.5 text-right tabular-nums">{money(Math.round(o.models))}</td>
            <td className={cn("px-3 py-2.5 text-right tabular-nums", o.left < 0 && "text-destructive")}>{money(Math.round(o.left))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const ECON_ROWS: { key: keyof TariffEconomy; label: string; hint?: string; fmt: (e: TariffEconomy) => string; good: "up" | "down"; points?: boolean; unit?: string }[] = [
  { fmt: (e) => money(Math.round(e.revenue)), good: "up", key: "revenue", label: "Выручка", hint: "без НДС" },
  { fmt: (e) => money(Math.round(e.models)), good: "down", key: "models", label: "Модели в среднем" },
  { fmt: (e) => money(Math.round(e.worst)), good: "down", key: "worst", label: "Худший случай", hint: "недельный лимит × 4,34" },
  { fmt: (e) => pct(e.hit), good: "down", key: "hit", label: "Человеко-недель с упором", points: true },
  { fmt: (e) => `${e.rejected.toFixed(1).replace(".", ",")} %`, good: "down", key: "rejected", label: "Отклонённых запросов", points: true },
  { fmt: (e) => `${e.near} чел.`, good: "down", key: "near", label: "Близко к лимиту", hint: "от 80 % недели сейчас", unit: "чел." },
];

/** Тарифы на одно место: столбцы — тарифы (на телефоне — карточка на тариф). */
export const TariffEconomyTable = ({ f, base, dirty }: { f: MonthForecast; base: MonthForecast; dirty: boolean }) => {
  const phone = usePhone();
  const b = (id: TariffId) => base.byTariff.find((x) => x.id === id) ?? base.byTariff[0];
  const value = (e: TariffEconomy, r: (typeof ECON_ROWS)[number]) => (
    <span className="flex flex-col items-end">
      <span className={cn("tabular-nums", r.key === "worst" && e.worst > e.revenue - e.servers && "text-destructive")}>{r.fmt(e)}</span>
      {dirty && <Delta good={r.good} pctPoints={r.points} unit={r.unit} value={(e[r.key] as number) - (b(e.id)[r.key] as number)} />}
    </span>
  );
  if (phone) {
    return (
      <div className="flex flex-col gap-2">
        {f.byTariff.map((e) => (
          <div className="rounded-lg border" key={e.id}>
            <div className="flex items-center justify-between border-b px-4 py-2">
              <TariffBadge id={e.id} />
              <span className="text-muted-foreground text-xs">{e.seats} мест на декабрь</span>
            </div>
            <dl className="divide-y">
              {ECON_ROWS.map((r) => (
                <div className="flex items-start justify-between gap-3 px-4 py-2" key={r.key}>
                  <dt className="text-muted-foreground">{r.label}</dt>
                  <dd>{value(e, r)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
        <thead className="text-muted-foreground bg-muted/40 text-xs">
          <tr>
            <th className="px-4 py-2 text-left font-medium">На одно место в месяц</th>
            {f.byTariff.map((e) => (
              <th className="px-3 py-2 text-right font-medium" key={e.id}>
                {tariffById(e.id).name} · {e.seats} мест
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {ECON_ROWS.map((r) => (
            <tr key={r.key}>
              <td className="px-4 py-2.5">
                <span className="flex flex-col">
                  {r.label}
                  {r.hint && <span className="text-muted-foreground text-xs">{r.hint}</span>}
                </span>
              </td>
              {f.byTariff.map((e) => (
                <td className="px-3 py-2.5 text-right align-top" key={e.id}>
                  {value(e, r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ── Покрутить ───────────────────────────────────────────────────────────────────────────────────────────────────────

const KnobInput = ({ value, onChange, label, unit, changed }: { value: number; onChange: (n: number) => void; label: string; unit: string; changed: boolean }) => (
  <InputGroup className={cn("w-32", changed && "border-primary")}>
    <InputGroupInput
      aria-label={label}
      className="text-right tabular-nums"
      inputMode="decimal"
      onChange={(e) => {
        const n = Number(e.target.value.replace(",", ".").replace(/\s/g, ""));
        if (!Number.isNaN(n)) onChange(n);
      }}
      value={String(value)}
    />
    <InputGroupAddon align="inline-end">
      <InputGroupText>{unit}</InputGroupText>
    </InputGroupAddon>
  </InputGroup>
);

const Knob = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="flex min-w-0 flex-col">
      <span className="text-sm">{label}</span>
      {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
    </span>
    {children}
  </div>
);

/** Все ручки «покрутить». `only` — показать лишь часть (вариант «По тарифам» раскладывает лимиты по карточкам). */
export const KnobFields = ({ only }: { only?: ("platform" | "limits" | "model")[] }) => {
  const s = useTariffs();
  const k = s.tweak;
  const set = (patch: Partial<Knobs>) => s.setTweak({ ...k, ...patch });
  const show = (part: "platform" | "limits" | "model") => !only || only.includes(part);
  return (
    <div className="flex flex-col gap-3">
      {show("platform") && (
        <>
          <Knob hint="Задаётся в «Курсах и налогах»" label="Курс доллара">
            <KnobInput changed={k.rate !== s.base.rate} label="Курс доллара" onChange={(n) => set({ rate: n })} unit="₽" value={k.rate} />
          </Knob>
          <Knob label="Комиссия за оплату в долларах">
            <KnobInput changed={k.fee !== s.base.fee} label="Комиссия" onChange={(n) => set({ fee: n })} unit="%" value={k.fee} />
          </Knob>
          <Knob label="НДС">
            <KnobInput changed={k.vat !== s.base.vat} label="НДС" onChange={(n) => set({ vat: n })} unit="%" value={k.vat} />
          </Knob>
          <Knob hint="Больше запросов на место" label="Рост нагрузки">
            <KnobInput changed={k.growth !== 0} label="Рост нагрузки" onChange={(n) => set({ growth: n })} unit="%" value={k.growth} />
          </Knob>
        </>
      )}
      {show("limits") &&
        TARIFF_IDS.map((t) => (
          <Knob key={t} label={`Неделя · ${tariffById(t).name}`}>
            <KnobInput changed={k.week[t] !== s.base.week[t]} label={`Недельный лимит, ${tariffById(t).name}`} onChange={(n) => set({ week: { ...k.week, [t]: n } })} unit="₽" value={k.week[t]} />
          </Knob>
        ))}
      {show("model") && <AllOnModel />}
    </div>
  );
};

export const AllOnModel = () => {
  const s = useTariffs();
  const k = s.tweak;
  return (
    <Knob hint="Как будто все ответы — на одной модели" label="Все ответы на модели">
      <Select onValueChange={(v) => s.setTweak({ ...k, allOn: v === "now" ? "" : String(v) })} value={k.allOn || "now"}>
        <SelectTrigger aria-label="Все ответы на модели" className={cn("w-40", k.allOn && "border-primary")}>
          <SelectValue>{k.allOn ? MODELS.find((m) => m.id === k.allOn)?.name : "как сейчас"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="now">как сейчас</SelectItem>
          {MODELS.filter((m) => m.priced).map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Knob>
  );
};

export const TweakBar = ({ className }: { className?: string }) => {
  const s = useTariffs();
  if (!s.dirty) return null;
  const changes = [
    ...TARIFF_IDS.filter((t) => s.tweak.week[t] !== s.base.week[t]).map((t) => `${tariffById(t).name}: неделя ${money(s.base.week[t])} → ${money(s.tweak.week[t])}`),
    ...(s.tweak.vat !== s.base.vat ? [`НДС ${s.base.vat} → ${s.tweak.vat} %`] : []),
  ];
  return (
    <Alert className={className} variant="info">
      <FlaskConical />
      <AlertDescription className="flex flex-col gap-3">
        <span>
          Расчёт с изменениями, ничего не сохранено.
          {changes.length > 0 ? ` «Применить к тарифу» сохранит: ${changes.join("; ")}.` : " Курс, комиссия, нагрузка и модель только для расчёта."}
        </span>
        <span className="flex flex-wrap gap-2">
          <Button onClick={s.reset} size="sm" variant="outline">
            Сбросить
          </Button>
          {s.dirtyTariff ? (
            <Button onClick={s.apply} size="sm">
              Применить к тарифу
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger render={<span />}>
                <Button disabled size="sm">
                  Применить к тарифу
                </Button>
              </TooltipTrigger>
              <TooltipContent>Лимиты и НДС не менялись</TooltipContent>
            </Tooltip>
          )}
        </span>
      </AlertDescription>
    </Alert>
  );
};
