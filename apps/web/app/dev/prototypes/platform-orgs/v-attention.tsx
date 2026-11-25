"use client";

import { Button } from "@metobe/ui/components/button";
import { Badge } from "@metobe/ui/components/reui/badge";
import { Stepper, StepperIndicator, StepperItem, StepperNav, StepperSeparator, StepperTitle, StepperTrigger } from "@metobe/ui/components/reui/stepper";
import { cn } from "@metobe/ui/lib/utils";
import { Check, ChevronLeft, Download, Plus } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { Section } from "@/components/settings/rows";
import { SettingsHeader, SettingsPageFrame } from "@/components/settings/settings-shell";

import { PERSON_STATUS, money, pct, revenueNow, seatTotal } from "../_orgs/data";
import type { Person } from "../_orgs/data";
import { Dot, NoteBar, OrgStatusBadge, PctBar, PlatformWindow, TariffBadge, Tile } from "../_orgs/frame";
import {
  BillState,
  DueAlert,
  EMPTY_ORG,
  Face,
  InviteResult,
  NewOrgSummary,
  OrgBills,
  OrgHead,
  OrgMenu,
  OrgNameFields,
  OrgPeople,
  OrgSeatFields,
  OrgSeats,
  OrgTerms,
  OrgTiles,
  PayText,
  PersonToggleIcon,
  SearchField,
  SeatsLine,
  ShareText,
  attention,
  billOrgs,
  isOff,
  matches,
  newOrgError,
  useOrgToggle,
  usePersonToggle,
} from "./parts";
import { toPay, useOrgs } from "./state";
import type { NewOrg, OrgView } from "./state";

// Вариант «Внимание»: сверху — четыре числа по всей платформе, ниже организации делятся на «Нужно внимание» (с
// причиной одной строкой) и «Остальные» карточками. Организация — одна длинная страница без вкладок. Новая
// организация — отдельная страница по шагам. Люди и счета тоже разложены по тому, что с ними делать.

const OrgCard = ({ o, ask, why }: { o: OrgView; ask: (o: OrgView) => void; why: ReturnType<typeof attention> }) => {
  const s = useOrgs();
  return (
    <div className={cn("bg-card flex flex-col gap-3 rounded-lg border p-4", isOff(o) && "bg-muted/30")}>
      <div className="flex items-start justify-between gap-2">
        <button className="flex min-w-0 flex-col items-start gap-0.5 text-left" onClick={() => s.go("org", o.id)} type="button">
          <span className="truncate font-medium hover:underline">{o.name}</span>
          <span className="text-muted-foreground truncate text-xs">{o.owner.name}</span>
        </button>
        <span className="flex shrink-0 items-center gap-1">
          <OrgStatusBadge short status={o.status} />
          <OrgMenu ask={ask} o={o} open={() => s.go("org", o.id)} />
        </span>
      </div>
      {why && (
        <p className={cn("flex items-center gap-2 text-sm", why.tone === "bad" && "text-destructive", why.tone === "warn" && "text-warning-foreground")}>
          <Dot tone={why.tone} />
          {why.text}
        </p>
      )}
      <SeatsLine seats={o.seats} used={o.used} />
      <dl className="grid grid-cols-2 gap-2 border-t pt-3 text-xs">
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">Декабрь</dt>
          <dd className="text-sm">
            <PayText o={o} />
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">Модели · доля</dt>
          <dd className="text-sm">
            <ShareText o={o} />
          </dd>
        </div>
      </dl>
    </div>
  );
};

const OrgList = () => {
  const s = useOrgs();
  const toggle = useOrgToggle();
  const [q, setQ] = useState("");
  const list = s.orgs.filter((o) => matches(q, o.name, o.owner.name, o.owner.email));
  const flagged = list.filter((o) => attention(o, s.day));
  const rest = list.filter((o) => !attention(o, s.day));
  const billed = billOrgs(s.orgs);
  const due = billed.reduce((a, o) => a + toPay(o), 0);
  const unpaid = billed.filter((o) => o.bill !== "paid");
  const spend = s.orgs.reduce((a, o) => a + o.spend, 0);
  const rev = s.orgs.reduce((a, o) => a + revenueNow(o), 0);
  return (
    <SettingsPageFrame>
      <div className="flex items-start justify-between gap-4">
        <SettingsHeader description="Что требует действия — сверху, остальное ниже." title="Организации" />
        <Button onClick={() => s.go("new")}>
          <Plus />
          <span className="max-sm:hidden">Новая организация</span>
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-4">
        <Tile hint={`${s.orgs.filter((o) => o.status === "trial").length} пробных, ${s.orgs.filter(isOff).length} отключено`} label="Организаций" value={s.orgs.length} />
        <Tile hint={`${s.orgs.reduce((a, o) => a + seatTotal(o.used), 0)} занято`} label="Мест" value={s.orgs.reduce((a, o) => a + seatTotal(o.seats), 0)} />
        <Tile hint={`не оплачено ${unpaid.length}`} label="К оплате за декабрь" tone={s.day === "1" && unpaid.length ? "bad" : undefined} value={money(due)} />
        <Tile hint={`${pct((spend / rev) * 100)} выручки`} label="Модели за ноябрь" value={money(spend)} />
      </div>
      <DueAlert />
      <SearchField onChange={setQ} placeholder="Название, владелец, почта" value={q} />
      {flagged.length > 0 && (
        <Section meta={flagged.length} title="Нужно внимание">
          <div className="grid grid-cols-1 gap-2 @2xl:grid-cols-2">
            {flagged.map((o) => (
              <OrgCard ask={toggle.ask} key={o.id} o={o} why={attention(o, s.day)} />
            ))}
          </div>
        </Section>
      )}
      <Section meta={rest.length} title="Остальные">
        <div className="grid grid-cols-1 gap-2 @2xl:grid-cols-2">
          {rest.map((o) => (
            <OrgCard ask={toggle.ask} key={o.id} o={o} why={null} />
          ))}
        </div>
      </Section>
      {toggle.dialog}
    </SettingsPageFrame>
  );
};

const OrgPage = () => {
  const s = useOrgs();
  const o = s.org;
  const toggle = useOrgToggle();
  const person = usePersonToggle();
  return (
    <SettingsPageFrame>
      <Button className="text-muted-foreground -mb-3 self-start max-sm:hidden" onClick={() => s.go("orgs")} size="sm" variant="ghost">
        <ChevronLeft />
        Организации
      </Button>
      <OrgHead ask={toggle.ask} o={o} />
      <OrgTiles o={o} />
      <OrgPeople o={o} onToggle={person.ask} />
      <OrgBills o={o} />
      <OrgSeats o={o} />
      <OrgTerms o={o} />
      {toggle.dialog}
      {person.dialog}
    </SettingsPageFrame>
  );
};

const STEPS = ["Организация", "Места и цена", "Приглашение"];

const NewOrgPage = () => {
  const s = useOrgs();
  const [step, setStep] = useState(1);
  const [f, setF] = useState<NewOrg>(EMPTY_ORG);
  const [done, setDone] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const error = newOrgError(f);
  const firstOk = f.name.trim() !== "" && /^\S+@\S+\.\S+$/.test(f.ownerEmail.trim());
  return (
    <SettingsPageFrame>
      <Button className="text-muted-foreground -mb-3 self-start max-sm:hidden" onClick={() => s.go("orgs")} size="sm" variant="ghost">
        <ChevronLeft />
        Организации
      </Button>
      <SettingsHeader description="Владелец получит ссылку-приглашение и сам пригласит людей на места." title="Новая организация" />
      <Stepper onValueChange={(v) => !done && (v < step || firstOk) && setStep(v)} value={step}>
        <StepperNav className="gap-2">
          {STEPS.map((t, i) => (
            <StepperItem completed={step > i + 1 || (i === 2 && done !== null)} key={t} step={i + 1}>
              <StepperTrigger className="gap-1.5">
                <StepperIndicator className="size-5 text-[11px]">{step > i + 1 ? <Check className="size-3" strokeWidth={3} /> : i + 1}</StepperIndicator>
                <StepperTitle className="text-muted-foreground group-data-[state=active]/step:text-foreground text-xs font-normal">{t}</StepperTitle>
              </StepperTrigger>
              {i < STEPS.length - 1 && <StepperSeparator className="mx-2" />}
            </StepperItem>
          ))}
        </StepperNav>
      </Stepper>
      <div className="flex max-w-lg flex-col gap-4">
        {step === 1 && <OrgNameFields f={f} set={setF} />}
        {step === 2 && <OrgSeatFields f={f} set={setF} />}
        {step === 3 &&
          (done ? (
            <InviteResult f={f} id={done} onOpen={() => s.go("org", done)} />
          ) : (
            <div className="flex flex-col gap-2 rounded-lg border p-4">
              <span className="font-medium">{f.name}</span>
              <span className="text-muted-foreground text-sm">
                Владелец: {f.ownerEmail} · {f.timezone}
                {f.domain ? ` · вход по домену ${f.domain}` : ""}
              </span>
              <NewOrgSummary f={f} />
            </div>
          ))}
        {tried && error && <p className="text-destructive text-sm">{error}</p>}
        {!done && (
          <div className="flex gap-2">
            {step > 1 && (
              <Button onClick={() => setStep(step - 1)} variant="outline">
                Назад
              </Button>
            )}
            {step < 3 ? (
              <Button
                onClick={() => {
                  setTried(true);
                  if (step === 1 ? firstOk : !error) {
                    setTried(false);
                    setStep(step + 1);
                  }
                }}
              >
                Дальше
              </Button>
            ) : (
              <Button onClick={() => !error && setDone(s.create(f))}>Завести и пригласить</Button>
            )}
          </div>
        )}
      </div>
    </SettingsPageFrame>
  );
};

const PersonLine = ({ p, onToggle, org }: { p: Person; onToggle: (p: Person) => void; org: string }) => (
  <li className="group flex items-center gap-3 px-4 py-2.5">
    <Face name={p.name} />
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="flex items-center gap-2">
        <span className="truncate font-medium">{p.name}</span>
        <TariffBadge id={p.tariff} />
      </span>
      <span className="text-muted-foreground truncate text-xs">
        {org} · {p.status === "active" ? `вход ${p.lastSeen}` : PERSON_STATUS[p.status]} · {money(p.spend)}
      </span>
    </span>
    {p.status === "active" && <PctBar label="Неделя" value={p.week} />}
    {p.role !== "owner" && <PersonToggleIcon onToggle={onToggle} p={p} />}
  </li>
);

const Group = ({ title, meta, children }: { title: string; meta: ReactNode; children: ReactNode }) => (
  <Section meta={meta} title={title}>
    <ul className="divide-y rounded-lg border">{children}</ul>
  </Section>
);

const PeoplePage = () => {
  const s = useOrgs();
  const person = usePersonToggle();
  const [q, setQ] = useState("");
  const name = (id: string) => s.orgs.find((o) => o.id === id)?.name ?? "";
  const list = s.people.filter((p) => matches(q, p.name, p.email, name(p.org)));
  const full = list.filter((p) => p.status === "active" && p.week >= 100);
  const near = list.filter((p) => p.status === "active" && p.week >= 80 && p.week < 100);
  const off = list.filter((p) => p.status === "off-platform" || p.status === "off-owner");
  const rest = list.filter((p) => !full.includes(p) && !near.includes(p) && !off.includes(p));
  const groups: [string, Person[]][] = [
    ["Упёрлись в недельный лимит", full],
    ["Близко к лимиту, от 80 %", near],
    ["Отключены", off],
    ["Остальные", rest],
  ];
  return (
    <SettingsPageFrame>
      <SettingsHeader description="Все люди всех организаций, сначала те, кто упёрся в лимит." title="Люди" />
      <SearchField onChange={setQ} placeholder="Имя, почта или организация" value={q} />
      {groups
        .filter(([, g]) => g.length > 0)
        .map(([title, g]) => (
          <Group key={title} meta={g.length} title={title}>
            {g.map((p) => (
              <PersonLine key={p.id} onToggle={person.ask} org={name(p.org)} p={p} />
            ))}
          </Group>
        ))}
      {person.dialog}
    </SettingsPageFrame>
  );
};

const BillsPage = () => {
  const s = useOrgs();
  const list = billOrgs(s.orgs);
  const open = list.filter((o) => o.bill !== "paid");
  const paid = list.filter((o) => o.bill === "paid");
  const sum = (l: OrgView[]) => money(l.reduce((a, o) => a + toPay(o), 0));
  const line = (o: OrgView) => (
    <li className="flex items-center gap-3 px-4 py-2.5" key={o.id}>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{o.name}</span>
        <span className="text-muted-foreground text-xs">
          <BillState o={o} />
        </span>
      </span>
      <span className="tabular-nums">{money(toPay(o))}</span>
      {o.bill !== "paid" && (
        <span className="flex gap-1">
          <Button className="max-sm:hidden" onClick={() => s.moveDue(o.id, "5 декабря")} size="sm" variant="ghost">
            Перенести
          </Button>
          <Button onClick={() => s.markPaid(o.id)} size="sm" variant="outline">
            Оплачен
          </Button>
        </span>
      )}
    </li>
  );
  return (
    <SettingsPageFrame>
      <div className="flex items-start justify-between gap-4">
        <SettingsHeader description="Счета за декабрь выставлены 25 ноября, срок оплаты — 1 декабря." title="Счета" />
        <Button variant="outline">
          <Download />
          <span className="max-sm:hidden">CSV</span>
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2 max-sm:grid-cols-1">
        <Tile label="Выставлено" value={sum(list)} />
        <Tile label="Оплачено" value={sum(paid)} />
        <Tile hint={`${open.length} счетов`} label="Ждём" tone={s.day === "1" && open.length ? "bad" : undefined} value={sum(open)} />
      </div>
      <DueAlert />
      {open.length > 0 && (
        <Group meta={sum(open)} title="Не оплачены">
          {open.map(line)}
        </Group>
      )}
      <Group meta={sum(paid)} title="Оплачены">
        {paid.map(line)}
      </Group>
      <p className="text-muted-foreground flex items-center gap-2 text-xs">
        <Badge variant="info-light">Пробные</Badge>
        {s.orgs
          .filter((o) => o.status === "trial")
          .map((o) => `${o.name} — до ${o.trialUntil}`)
          .join(", ")}
      </p>
    </SettingsPageFrame>
  );
};

const TITLES = { bills: "Счета", new: "Новая организация", org: "Организация", orgs: "Организации", people: "Люди" } as const;

export const AttentionVariant = () => {
  const s = useOrgs();
  const page = s.scr === "people" ? "people" : s.scr === "bills" ? "bills" : "orgs";
  return (
    <PlatformWindow
      back={s.scr === "org" || s.scr === "new" ? () => s.go("orgs") : undefined}
      onNavigate={(p) => {
        if (p === "orgs" || p === "people" || p === "bills") {
          s.go(p);
          return true;
        }
        return false;
      }}
      page={page}
      title={s.scr === "org" ? s.org.name : TITLES[s.scr]}
    >
      {s.scr === "org" ? <OrgPage /> : s.scr === "new" ? <NewOrgPage /> : s.scr === "people" ? <PeoplePage /> : s.scr === "bills" ? <BillsPage /> : <OrgList />}
      <NoteBar />
    </PlatformWindow>
  );
};
