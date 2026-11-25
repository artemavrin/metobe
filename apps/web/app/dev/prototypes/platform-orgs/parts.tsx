"use client";

import { Button } from "@metobe/ui/components/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@metobe/ui/components/dropdown-menu";
import { Input } from "@metobe/ui/components/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@metobe/ui/components/input-group";
import { Alert, AlertDescription } from "@metobe/ui/components/reui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@metobe/ui/components/select";
import { Switch } from "@metobe/ui/components/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import { Check, Copy, Ellipsis, Power, PowerOff, Search, TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { Row, Rows, Section } from "@/components/settings/rows";

import { PAST_BILLS, ROLE_TEXT, SEAT_HISTORY, TARIFF_IDS, TIMEZONES, invoiceFor, money, pct, priceFor, seatTotal, tariffById } from "../_orgs/data";
import type { Person, Seats, TariffId } from "../_orgs/data";
import { ConfirmDialog, Dot, OrgStatusBadge, PctBar, PersonStatusBadge, TariffBadge, Tile } from "../_orgs/frame";
import { usePhone } from "../privacy/frame";
import { inviteLink, modelShare, toPay, unpaid, useOrgs } from "./state";
import type { NewOrg, OrgView } from "./state";

// Куски P36, из которых варианты собирают экраны: строки людей и счетов, разделы страницы организации, форма новой
// организации, подтверждения. Варианты различаются раскладкой, а не словами.

// ── Отключить и включить ────────────────────────────────────────────────────────────────────────────────────────────

export const isOff = (o: OrgView) => o.status === "off-manual" || o.status === "off-unpaid";

/** Кнопка «Отключить» / «Включить» организации с подтверждением отключения. */
export const useOrgToggle = () => {
  const s = useOrgs();
  const [target, setTarget] = useState<OrgView | null>(null);
  const ask = (o: OrgView) => {
    if (isOff(o)) {
      if (o.status === "off-unpaid") s.markPaid(o.id);
      else s.enableOrg(o.id);
    } else setTarget(o);
  };
  const dialog = (
    <ConfirmDialog
      action="Отключить"
      destructive
      onClose={() => setTarget(null)}
      onConfirm={() => target && s.disableOrg(target.id)}
      open={target !== null}
      text={`Люди «${target?.name}» не смогут войти: увидят «Организация отключена». Чаты, задачи, память и уведомления остановятся, данные сохранятся.`}
      title={`Отключить «${target?.name}»?`}
    />
  );
  return { ask, dialog };
};

/** У отключённой за неоплату «Включить» означает «Отметить оплату»: иначе в 00:00 она отключится снова. */
export const toggleWord = (o: OrgView) => (o.status === "off-unpaid" ? "Отметить оплату и включить" : isOff(o) ? "Включить" : "Отключить");

export const OrgToggleButton = ({ o, ask, size = "sm" }: { o: OrgView; ask: (o: OrgView) => void; size?: "sm" | "default" }) => (
  <Button onClick={() => ask(o)} size={size} variant={isOff(o) ? "default" : "outline"}>
    {isOff(o) ? <Power /> : <PowerOff />}
    {toggleWord(o)}
  </Button>
);

export const usePersonToggle = () => {
  const s = useOrgs();
  const [target, setTarget] = useState<Person | null>(null);
  const ask = (p: Person) => {
    if (p.status === "off-platform" || p.status === "off-owner") s.enablePerson(p);
    else setTarget(p);
  };
  const dialog = (
    <ConfirmDialog
      action="Отключить"
      destructive
      onClose={() => setTarget(null)}
      onConfirm={() => target && s.disablePerson(target)}
      open={target !== null}
      text={`${target?.name} не сможет войти, место освободится, данные сохранятся. Включить обратно сможет только платформа — владелец организации не сможет.`}
      title={`Отключить ${target?.name}?`}
    />
  );
  return { ask, dialog };
};

const personOff = (p: Person) => p.status === "off-platform" || p.status === "off-owner";

// ── Строка организации: что в ней видно ─────────────────────────────────────────────────────────────────────────────

export const SeatsLine = ({ seats, used }: { seats: Seats; used?: Seats }) => (
  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs tabular-nums">
    {TARIFF_IDS.filter((t) => seats[t] > 0).map((t) => (
      <span className="text-muted-foreground whitespace-nowrap" key={t}>
        {tariffById(t).name} <span className="text-foreground">{used ? `${used[t]}/${seats[t]}` : seats[t]}</span>
      </span>
    ))}
  </span>
);

export const ShareText = ({ o }: { o: OrgView }) => {
  const share = modelShare(o);
  return (
    <Tooltip>
      <TooltipTrigger render={<span className={cn("whitespace-nowrap tabular-nums", share >= 50 && "text-warning-foreground font-medium")} />}>
        {money(o.spend)} · {pct(share)}
      </TooltipTrigger>
      <TooltipContent>Расход на модели с 1 ноября и его доля от выручки за ноябрь без НДС</TooltipContent>
    </Tooltip>
  );
};

export const PayText = ({ o }: { o: OrgView }) => {
  if (o.status === "trial") return <span className="text-muted-foreground">до {o.trialUntil} без счёта</span>;
  return (
    <span className="flex items-center gap-1.5 tabular-nums">
      {money(toPay(o))}
      <BillMark o={o} />
    </span>
  );
};

export const BillMark = ({ o }: { o: OrgView }) => {
  if (o.bill === "paid") return <Check aria-label="Оплачен" className="text-success size-3.5" />;
  if (o.bill === "late") return <span className="text-destructive text-xs">просрочен</span>;
  if (o.bill === "issued") return <span className="text-muted-foreground text-xs whitespace-nowrap">до {o.due}</span>;
  return null;
};

export const OrgMenu = ({ o, ask, open }: { o: OrgView; ask: (o: OrgView) => void; open?: () => void }) => {
  const s = useOrgs();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button aria-label="Действия" size="icon-sm" variant="ghost" />}>
        <Ellipsis />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {open && <DropdownMenuItem onClick={open}>Открыть</DropdownMenuItem>}
        {o.bill !== "paid" && o.bill !== "none" && <DropdownMenuItem onClick={() => s.markPaid(o.id)}>Отметить оплату</DropdownMenuItem>}
        {o.bill !== "paid" && o.bill !== "none" && <DropdownMenuItem onClick={() => s.moveDue(o.id, "5 декабря")}>Перенести срок на 5 декабря</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => ask(o)} variant={isOff(o) ? "default" : "destructive"}>
          {toggleWord(o)}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/** Почему организация требует внимания — одной строкой; `null` — всё в порядке. */
export const attention = (o: OrgView, day: string): { tone: "bad" | "warn" | "info"; text: string } | null => {
  if (o.status === "off-unpaid") return { text: `Отключена: не оплачен счёт за ${o.unpaidMonth}`, tone: "bad" };
  if (o.status === "off-manual") return { text: "Отключена вручную", tone: "warn" };
  if (o.bill === "issued" && day !== "25") return { text: `Счёт за декабрь не оплачен, срок ${o.due}`, tone: "warn" };
  if (o.status === "trial") return { text: `Пробный период до ${o.trialUntil}`, tone: "info" };
  if (modelShare(o) >= 50) return { text: `Модели — ${pct(modelShare(o))} выручки`, tone: "warn" };
  if (seatTotal(o.next) < seatTotal(o.used)) return { text: `На декабрь ${seatTotal(o.next)} мест, занято ${seatTotal(o.used)}`, tone: "info" };
  return null;
};

export const DueAlert = () => {
  const s = useOrgs();
  const list = unpaid(s.orgs).filter((o) => o.status !== "off-unpaid" || o.unpaidMonth === "декабрь");
  const cut = s.orgs.filter((o) => o.unpaidMonth === "декабрь");
  if (s.day === "25" || list.length === 0) return null;
  return (
    <Alert variant={s.day === "1" ? "destructive" : "warning"}>
      <TriangleAlert />
      <AlertDescription>
        {s.day === "1"
          ? `1 декабря, 00:00: отключены без оплаты — ${cut.map((o) => o.name).join(", ")}. Отметка «Оплачен» включает сразу.`
          : `До срока 3 дня: не оплачено ${list.length} счёта на ${money(list.reduce((a, o) => a + toPay(o), 0))}. 1 декабря в 00:00 эти организации отключатся.`}
      </AlertDescription>
    </Alert>
  );
};

// ── Поиск ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export const SearchField = ({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) => (
  <InputGroup className={cn("max-w-xs max-sm:max-w-none", className)}>
    <InputGroupAddon>
      <Search />
    </InputGroupAddon>
    <InputGroupInput aria-label={placeholder} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} value={value} />
  </InputGroup>
);

export const matches = (q: string, ...fields: string[]) => q.trim() === "" || fields.some((f) => f.toLowerCase().includes(q.trim().toLowerCase()));

// ── Люди ────────────────────────────────────────────────────────────────────────────────────────────────────────────

const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("");

export const Face = ({ name }: { name: string }) => (
  <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium">{initials(name)}</span>
);

/** Таблица людей: на компьютере — столбцы, на телефоне — строка в две линии. */
export const PeopleTable = ({ people, showOrg, onToggle, onOpen }: { people: Person[]; showOrg?: boolean; onToggle: (p: Person) => void; onOpen?: (p: Person) => void }) => {
  const phone = usePhone();
  const s = useOrgs();
  const orgName = (id: string) => s.orgs.find((o) => o.id === id)?.name ?? "";
  if (people.length === 0) return <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center">Никого не нашлось</p>;
  if (phone) {
    return (
      <ul className="divide-y rounded-lg border">
        {people.map((p) => (
          <li className={cn("flex items-center gap-3 px-3 py-2.5", personOff(p) && "opacity-60")} key={p.id} onClick={() => onOpen?.(p)}>
            <Face name={p.name} />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="truncate font-medium">{p.name}</span>
              <span className="text-muted-foreground flex min-w-0 items-center gap-2 text-xs">
                <TariffBadge id={p.tariff} />
                <span className="truncate">
                  {showOrg ? orgName(p.org) : ROLE_TEXT[p.role]} · {money(p.spend)}
                </span>
              </span>
              <PersonStatusBadge status={p.status} />
            </span>
            {p.status === "active" ? <PctBar label="Неделя" value={p.week} /> : null}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
        <thead className="text-muted-foreground bg-muted/40 text-left text-xs">
          <tr>
            <th className="px-4 py-2 font-medium">Человек</th>
            {showOrg && <th className="px-3 py-2 font-medium">Организация</th>}
            <th className="px-3 py-2 font-medium">Тариф</th>
            <th className="px-3 py-2 font-medium">Неделя</th>
            <th className="px-3 py-2 text-right font-medium">Расход за ноябрь</th>
            <th className="px-3 py-2 font-medium">Последний вход</th>
            <th className="w-12" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {people.map((p) => (
            <tr className={cn("group", onOpen && "hover:bg-muted/40 cursor-pointer", personOff(p) && "text-muted-foreground")} key={p.id} onClick={() => onOpen?.(p)}>
              <td className="px-4 py-2.5">
                <span className="flex items-center gap-3">
                  <Face name={p.name} />
                  <span className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-2 font-medium">
                      {p.name}
                      {p.role !== "member" && <span className="text-muted-foreground text-xs font-normal">{ROLE_TEXT[p.role]}</span>}
                    </span>
                    <span className="text-muted-foreground text-xs">{p.email}</span>
                  </span>
                </span>
              </td>
              {showOrg && <td className="px-3 py-2.5">{orgName(p.org)}</td>}
              <td className="px-3 py-2.5">
                <TariffBadge id={p.tariff} />
              </td>
              <td className="px-3 py-2.5">{p.status === "active" ? <PctBar label="Неделя" value={p.week} /> : <PersonStatusBadge status={p.status} />}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{money(p.spend)}</td>
              <td className="text-muted-foreground px-3 py-2.5">{p.lastSeen}</td>
              <td className="px-2 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                {p.role !== "owner" && <PersonToggleIcon onToggle={onToggle} p={p} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const PersonToggleIcon = ({ p, onToggle }: { p: Person; onToggle: (p: Person) => void }) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <Button
          aria-label={personOff(p) ? "Включить" : "Отключить"}
          className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-100"
          onClick={() => onToggle(p)}
          size="icon-sm"
          variant="ghost"
        />
      }
    >
      {personOff(p) ? <Power /> : <PowerOff />}
    </TooltipTrigger>
    <TooltipContent>{personOff(p) ? "Включить" : "Отключить"}</TooltipContent>
  </Tooltip>
);

// ── Разделы страницы организации ────────────────────────────────────────────────────────────────────────────────────

export const OrgTiles = ({ o }: { o: OrgView }) => (
  <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-4">
    <Tile hint={<SeatsLine seats={o.seats} used={o.used} />} label="Места: занято из" value={`${seatTotal(o.used)} из ${seatTotal(o.seats)}`} />
    <Tile
      hint={o.status === "trial" ? `пробная до ${o.trialUntil}` : o.bill === "paid" ? "оплачен" : o.bill === "late" ? "просрочен" : `срок ${o.due}`}
      label="К оплате за декабрь"
      tone={o.bill === "late" ? "bad" : undefined}
      value={o.status === "trial" ? "—" : money(toPay(o))}
    />
    <Tile hint={`${pct(modelShare(o))} выручки`} label="Модели за ноябрь" tone={modelShare(o) >= 50 ? "warn" : undefined} value={money(o.spend)} />
    <Tile hint="в этом месяце" label="Упирались в неделю" value={`${o.hitWeek} чел.`} />
  </div>
);

export const OrgPeople = ({ o, onToggle }: { o: OrgView; onToggle: (p: Person) => void }) => {
  const s = useOrgs();
  const people = s.people.filter((p) => p.org === o.id);
  return (
    <Section meta={`${people.filter((p) => !personOff(p)).length} занимают места`} title="Люди">
      <PeopleTable onToggle={onToggle} people={people} />
    </Section>
  );
};

export const OrgSeats = ({ o }: { o: OrgView }) => (
  <Section title="Места">
    <Rows>
      {TARIFF_IDS.map((t) => (
        <Row hint={`${money(priceFor(o, t))} в месяц${o.customPrice?.[t] ? " · своя цена" : ""}`} key={t} label={tariffById(t).name}>
          <span className="flex items-center gap-4 text-sm tabular-nums">
            <span>
              занято {o.used[t]} из {o.seats[t]}
            </span>
            <span className={cn("text-muted-foreground", o.next[t] < o.used[t] && "text-warning-foreground")}>на декабрь {o.next[t]}</span>
          </span>
        </Row>
      ))}
    </Rows>
    {(SEAT_HISTORY[o.id] ?? []).length > 0 && (
      <ol className="flex flex-col gap-2 pt-1">
        {SEAT_HISTORY[o.id].map((h) => (
          <li className="flex gap-3 text-sm" key={h.date + h.text}>
            <span className="text-muted-foreground w-20 shrink-0 tabular-nums">{h.date}</span>
            <span>{h.text}</span>
          </li>
        ))}
      </ol>
    )}
  </Section>
);

export const OrgBills = ({ o }: { o: OrgView }) => {
  const s = useOrgs();
  const inv = invoiceFor(o);
  return (
    <Section
      action={
        o.bill === "issued" || o.bill === "late" ? (
          <span className="flex gap-2">
            <Button onClick={() => s.moveDue(o.id, "5 декабря")} size="sm" variant="ghost">
              Перенести срок
            </Button>
            <Button onClick={() => s.markPaid(o.id)} size="sm" variant="outline">
              <Check />
              Оплачен
            </Button>
          </span>
        ) : undefined
      }
      meta={o.status === "trial" ? `пробная до ${o.trialUntil}, счёта нет` : o.bill === "paid" ? "оплачен" : `срок ${o.due}`}
      title="Счёт за декабрь"
    >
      {o.status !== "trial" && (
        <div className="rounded-lg border">
          <ul className="divide-y">
            {[...inv.lines, ...inv.extras].map((l) => (
              <li className="flex justify-between gap-4 px-4 py-2.5" key={l.text}>
                <span className="min-w-0">{l.text}</span>
                <span className="shrink-0 tabular-nums">{money(l.sum)}</span>
              </li>
            ))}
            <li className="text-muted-foreground flex justify-between gap-4 px-4 py-2.5">
              <span>НДС 22 % сверху</span>
              <span className="tabular-nums">{money(inv.vat)}</span>
            </li>
            <li className="flex justify-between gap-4 px-4 py-2.5 font-semibold">
              <span>Итого</span>
              <span className="tabular-nums">{money(inv.total)}</span>
            </li>
          </ul>
        </div>
      )}
      <ul className="flex flex-col gap-1.5 text-sm">
        {PAST_BILLS.map((b) => (
          <li className="flex items-center justify-between gap-3" key={b.month}>
            <span className="text-muted-foreground">{b.month}</span>
            <span className="flex items-center gap-2 tabular-nums">
              {money(b.sum)}
              <Check aria-label="Оплачен" className="text-success size-3.5" />
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
};

export const OrgTerms = ({ o }: { o: OrgView }) => (
  <Section title="Условия">
    <Rows>
      <Row hint="Пусто — цена тарифа" label="Своя цена">
        <span className="tabular-nums">{o.customPrice ? TARIFF_IDS.filter((t) => o.customPrice?.[t]).map((t) => `${tariffById(t).name} ${money(priceFor(o, t))}`).join(" · ") : "нет"}</span>
      </Row>
      <Row hint="Неделя лимитов и месяц счёта" label="Часовой пояс">
        {o.timezone}
      </Row>
      <Row hint="Вход по домену почты даёт тариф по умолчанию" label="Домены для входа">
        {o.domains.length ? o.domains.join(", ") : <span className="text-muted-foreground">нет</span>}
      </Row>
      <Row label="Пробный период">{o.trialUntil ? `до ${o.trialUntil}` : <span className="text-muted-foreground">нет</span>}</Row>
      <Row label="Владелец">
        <span className="flex flex-col items-end max-md:items-start">
          <span>{o.owner.name}</span>
          <span className="text-muted-foreground text-xs">{o.owner.email}</span>
        </span>
      </Row>
      <Row label="Заведена">{o.created}</Row>
    </Rows>
  </Section>
);

export const OrgHead = ({ o, ask, extra }: { o: OrgView; ask: (o: OrgView) => void; extra?: ReactNode }) => (
  <header className="flex flex-col gap-3 @lg:flex-row @lg:items-start @lg:justify-between">
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold tracking-tight">{o.name}</h1>
        <OrgStatusBadge status={o.status} trialUntil={o.trialUntil} />
      </div>
      <p className="text-muted-foreground">
        {o.owner.name} · {o.owner.email}
      </p>
      {o.status === "off-unpaid" && <p className="text-destructive text-sm">Организация отключена: не оплачен счёт за {o.unpaidMonth}</p>}
    </div>
    <div className="flex shrink-0 gap-2">
      {extra}
      <OrgToggleButton ask={ask} o={o} />
    </div>
  </header>
);

// ── Счета за месяц ──────────────────────────────────────────────────────────────────────────────────────────────────

export const BillState = ({ o }: { o: OrgView }) => {
  if (o.bill === "paid") return <span className="text-success flex items-center gap-1.5"><Dot tone="ok" />Оплачен</span>;
  if (o.bill === "late") return <span className="text-destructive flex items-center gap-1.5"><Dot tone="bad" />Просрочен</span>;
  return <span className="flex items-center gap-1.5"><Dot tone="off" />Выставлен</span>;
};

export const billOrgs = (orgs: OrgView[]) => orgs.filter((o) => o.bill !== "none");

// ── Новая организация ───────────────────────────────────────────────────────────────────────────────────────────────

export const EMPTY_ORG: NewOrg = {
  custom: false,
  domain: "",
  name: "",
  ownerEmail: "",
  prices: {},
  seats: { basic: 5, max: 0, pro: 1 },
  timezone: "Москва",
  trial: true,
  trialUntil: "25 декабря",
};

export const newOrgError = (f: NewOrg) => {
  if (f.name.trim() === "") return "Нужно название";
  if (!/^\S+@\S+\.\S+$/.test(f.ownerEmail.trim())) return "Нужна почта владельца";
  if (seatTotal(f.seats) < 1) return "Нужно хотя бы одно место — его займёт владелец";
  return null;
};

const Num = ({ value, onChange, label, className }: { value: number | undefined; onChange: (n: number | undefined) => void; label: string; className?: string }) => (
  <Input
    aria-label={label}
    className={cn("w-20 text-right tabular-nums", className)}
    inputMode="numeric"
    onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value.replace(/\D/g, "")))}
    value={value ?? ""}
  />
);

export const FormField = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <label className="flex flex-col gap-1.5">
    <span className="text-sm font-medium">{label}</span>
    {children}
    {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
  </label>
);

export const OrgNameFields = ({ f, set }: { f: NewOrg; set: (f: NewOrg) => void }) => (
  <>
    <FormField label="Название">
      <Input onChange={(e) => set({ ...f, name: e.target.value })} placeholder="Например, Северное бюро" value={f.name} />
    </FormField>
    <FormField hint="Придёт ссылка-приглашение. Владелец тоже занимает место" label="Почта владельца">
      <Input inputMode="email" onChange={(e) => set({ ...f, ownerEmail: e.target.value })} placeholder="owner@company.example" value={f.ownerEmail} />
    </FormField>
    <FormField hint="Неделя лимитов и месяц счёта" label="Часовой пояс">
      <Select onValueChange={(v) => set({ ...f, timezone: String(v) })} value={f.timezone}>
        <SelectTrigger aria-label="Часовой пояс" className="w-full">
          <SelectValue>{f.timezone}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {TIMEZONES.map((t) => (
            <SelectItem key={t} value={t}>
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
    <FormField hint="Необязательно. Люди с почтой на этом домене входят сами, если есть свободное место" label="Домен для входа">
      <Input onChange={(e) => set({ ...f, domain: e.target.value })} placeholder="company.example" value={f.domain} />
    </FormField>
  </>
);

export const OrgSeatFields = ({ f, set }: { f: NewOrg; set: (f: NewOrg) => void }) => (
  <div className="flex flex-col gap-3">
    <div className="rounded-lg border">
      {TARIFF_IDS.map((t) => (
        <div className="flex items-center gap-3 border-b px-3 py-2.5 last:border-b-0" key={t}>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-medium">{tariffById(t).name}</span>
            <span className="text-muted-foreground text-xs">{money(tariffById(t).price)} в месяц</span>
          </span>
          {f.custom && <Num className="w-24" label={`Своя цена: ${tariffById(t).name}`} onChange={(n) => set({ ...f, prices: { ...f.prices, [t]: n } })} value={f.prices[t]} />}
          <Num label={`Мест: ${tariffById(t).name}`} onChange={(n) => set({ ...f, seats: { ...f.seats, [t]: n ?? 0 } })} value={f.seats[t]} />
        </div>
      ))}
    </div>
    <label className="flex items-center justify-between gap-3">
      <span className="flex flex-col">
        <span className="text-sm font-medium">Своя цена</span>
        <span className="text-muted-foreground text-xs">Договорная цена места по тарифу</span>
      </span>
      <Switch checked={f.custom} onCheckedChange={(v) => set({ ...f, custom: v })} />
    </label>
    <label className="flex items-center justify-between gap-3">
      <span className="flex flex-col">
        <span className="text-sm font-medium">Пробный период</span>
        <span className="text-muted-foreground text-xs">{f.trial ? `До ${f.trialUntil} счетов нет` : "Первый счёт — 25-го, срок оплаты — 1-е"}</span>
      </span>
      <Switch checked={f.trial} onCheckedChange={(v) => set({ ...f, trial: v })} />
    </label>
    {f.trial && (
      <FormField label="Пробный период до">
        <Select onValueChange={(v) => set({ ...f, trialUntil: String(v) })} value={f.trialUntil}>
          <SelectTrigger aria-label="Пробный период до" className="w-full">
            <SelectValue>{f.trialUntil}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {["9 декабря", "25 декабря", "31 декабря"].map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
    )}
  </div>
);

export const NewOrgSummary = ({ f }: { f: NewOrg }) => (
  <p className="text-muted-foreground text-sm">
    {seatTotal(f.seats)} мест: <SeatsLine seats={f.seats} />
    {f.trial ? ` Пробный период до ${f.trialUntil}.` : ""}
  </p>
);

/** Результат: ссылка-приглашение владельцу. */
export const InviteResult = ({ id, f, onOpen }: { id: string; f: NewOrg; onOpen: () => void }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <Alert variant="success">
        <Check />
        <AlertDescription>
          Организация «{f.name}» заведена. Письмо со ссылкой отправлено на {f.ownerEmail}.
        </AlertDescription>
      </Alert>
      <FormField hint="По ссылке владелец входит и занимает место" label="Приглашение владельцу">
        <InputGroup>
          <InputGroupInput className="font-mono text-xs" readOnly value={inviteLink(id)} />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              onClick={() => {
                void navigator.clipboard?.writeText(inviteLink(id));
                setCopied(true);
              }}
            >
              {copied ? <Check /> : <Copy />}
              {copied ? "Скопировано" : "Копировать"}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </FormField>
      <Button className="self-start" onClick={onOpen} variant="outline">
        Открыть организацию
      </Button>
    </div>
  );
};
