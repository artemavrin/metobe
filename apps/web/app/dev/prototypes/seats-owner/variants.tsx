"use client";

import { Button } from "@metobe/ui/components/button";
import { Frame, FramePanel } from "@metobe/ui/components/reui/frame";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@metobe/ui/components/tabs";
import { cn } from "@metobe/ui/lib/utils";
import { Plus, UserPlus } from "lucide-react";
import type { ReactNode } from "react";

import { Row, Rows, Section } from "@/components/settings/rows";
import { SettingsHeader, SettingsPageFrame } from "@/components/settings/settings-shell";

import { ENTER, useProto } from "../memory/frame";
import { SettingsWindow } from "../seat-limits/window";
import { MONTH, TIERS, TIER_ORDER, seatsWord } from "./data";
import type { Tier } from "./data";
import { NextBill, OwnerProvider, PersonAvatar, PersonMenu, ShortWarnings, Stepper, TierBadge, WeekCell, personHint, personName, usageHead, useOwner } from "./parts";

// Варианты P37 — экран «Места» у владельца:
//   «Сводка» — всё на одной странице: таблица тарифов (сейчас, занято, свободно, в декабре), счёт за декабрь,
//              люди с тарифом и процентом недели;
//   «Места» — по карточке на тариф, место — кружок: человек, приглашение пунктиром, свободное — «+», которое
//             приглашает на этот тариф; в подвале карточки — сколько мест в декабре;
//   «Вкладки» — «Места», «Люди», «Использование» по вкладкам.
// Деньги — только цена места и доплаты; расхода на модели здесь нет.

const GROUPS = [
  { items: ["Аккаунт", "Подключения", "Лимиты"], title: "Моё" },
  { items: ["Места", "Люди", "Использование", "Организация"], title: "Северный ветер" },
];

const Toast = () => {
  const { note } = useProto();
  if (!note) return null;
  return (
    <div className={cn("bg-foreground text-background fixed bottom-20 left-1/2 z-50 max-w-[90%] -translate-x-1/2 rounded-full px-4 py-1.5 text-xs", ENTER)} role="status">
      {note.text}
    </div>
  );
};

const Screen = ({ active = "Места", children }: { active?: string; children: ReactNode }) => (
  <OwnerProvider>
    <SettingsWindow active={active} groups={GROUPS}>
      <SettingsPageFrame>{children}</SettingsPageFrame>
      <Toast />
    </SettingsWindow>
  </OwnerProvider>
);

const DESCRIPTION = "Места покупаются на месяц по тарифам. Добавленные места появляются сразу, убрать места можно со следующего месяца.";

const InviteButton = ({ tier }: { tier?: Tier }) => {
  const { ask } = useOwner();
  return (
    <Button onClick={() => ask({ kind: "invite", tier })} size="sm">
      <UserPlus />
      Пригласить
    </Button>
  );
};

const AddButton = ({ tier }: { tier?: Tier }) => {
  const { ask } = useOwner();
  return (
    <Button onClick={() => ask({ kind: "add", tier })} size="sm" variant="outline">
      <Plus />
      Добавить места
    </Button>
  );
};

const UsageHead = () => {
  const { s } = useOwner();
  const u = usageHead(s);
  return (
    <div className="grid grid-cols-3 gap-3">
      {[
        ["Упёрлись в лимит", u.out],
        ["Близко, от 80 %", u.near],
        ["Всего людей", u.people.length],
      ].map(([label, n]) => (
        <div className="flex flex-col rounded-lg border px-3 py-2.5" key={label}>
          <span className={cn("text-xl font-semibold tabular-nums", label === "Упёрлись в лимит" && Number(n) > 0 && "text-destructive")}>{n}</span>
          <span className="text-muted-foreground text-xs">{label}</span>
        </div>
      ))}
    </div>
  );
};

const UsageRows = () => {
  const { s } = useOwner();
  const people = [...usageHead(s).people].sort((a, b) => b.week - a.week);
  return (
    <Rows>
      {people.map((p) => (
        <Row hint={`${p.requests} запросов за неделю${p.hits ? ` · упирался ${p.hits} раз за 4 недели` : ""}`} key={p.id} label={p.name}>
          <span className="flex items-center gap-3">
            <TierBadge tier={p.tier} />
            <WeekCell pct={p.week} />
          </span>
        </Row>
      ))}
    </Rows>
  );
};

// ── 1. Сводка ────────────────────────────────────────────────────────────────────────────────────────────────────────

const TierTable = () => {
  const { s } = useOwner();
  return (
    <div className="overflow-hidden rounded-lg border text-sm">
      <div className="text-muted-foreground bg-muted/40 grid grid-cols-[minmax(0,1fr)_repeat(3,3.5rem)_6.5rem] items-center gap-2 border-b px-4 py-2 text-xs max-sm:grid-cols-[minmax(0,1fr)_repeat(2,3rem)_6.5rem]">
        <span>Тариф</span>
        <span className="text-right">Мест</span>
        <span className="text-right max-sm:hidden">Занято</span>
        <span className="text-right">Свободно</span>
        <span className="text-right">В декабре</span>
      </div>
      {TIER_ORDER.map((t) => (
        <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,3.5rem)_6.5rem] items-center gap-2 border-b px-4 py-2.5 last:border-b-0 max-sm:grid-cols-[minmax(0,1fr)_repeat(2,3rem)_6.5rem]" key={t}>
          <TierBadge tier={t} />
          <span className="text-right tabular-nums">{s.seats[t]}</span>
          <span className="text-right tabular-nums max-sm:hidden">{s.taken(t)}</span>
          <span className={cn("text-right tabular-nums", s.free(t) === 0 && "text-muted-foreground")}>{s.free(t)}</span>
          <span className="flex justify-end">
            <Stepper label={`${TIERS[t].title} в декабре`} onChange={(n) => s.setNext(t, n)} value={s.next[t]} />
          </span>
        </div>
      ))}
    </div>
  );
};

const PeopleRows = ({ usage }: { usage?: boolean }) => {
  const { s } = useOwner();
  return (
    <div className="divide-y rounded-lg border">
      {s.people.map((p) => (
        <div className="flex items-center gap-3 px-4 py-2.5" key={p.id}>
          <PersonAvatar p={p} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className={cn("truncate text-sm font-medium", p.invited && "text-muted-foreground font-normal")}>{personName(p)}</span>
            <span className="text-muted-foreground truncate text-xs">{personHint(p)}</span>
          </div>
          {usage && !p.invited && (
            <span className="max-sm:hidden">
              <WeekCell pct={p.week} />
            </span>
          )}
          <TierBadge tier={p.tier} />
          <PersonMenu p={p} />
        </div>
      ))}
    </div>
  );
};

export const Summary = () => (
  <Screen>
    <SettingsHeader description={DESCRIPTION} title="Места" />
    <Section action={<AddButton />} meta={`сегодня ${MONTH.today}`} title="Места по тарифам">
      <TierTable />
      <ShortWarnings />
    </Section>
    <Section title={`Счёт за ${MONTH.next}`}>
      <Frame>
        <FramePanel className="p-4">
          <NextBill />
        </FramePanel>
      </Frame>
    </Section>
    <Section action={<InviteButton />} meta="процент — недельного лимита" title="Люди">
      <PeopleRows usage />
    </Section>
  </Screen>
);

// ── 2. Места ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const SeatCard = ({ t }: { t: Tier }) => {
  const { s, ask } = useOwner();
  const people = s.people.filter((p) => p.tier === t);
  const free = s.free(t);
  return (
    <Frame>
      <FramePanel className="flex flex-col gap-4 p-4">
        <div className="flex items-center gap-2">
          <TierBadge tier={t} />
          <span className="text-muted-foreground flex-1 text-sm">
            {s.seats[t]} {seatsWord(s.seats[t])}, свободно {free}
          </span>
          <Button onClick={() => ask({ kind: "add", tier: t })} size="sm" variant="ghost">
            <Plus />
            Место
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {people.map((p) => (
            <PersonMenu
              key={p.id}
              p={p}
              trigger={
                <button className="flex w-16 flex-col items-center gap-1 rounded-lg p-1 text-center outline-none hover:bg-muted focus-visible:ring-2" title={personHint(p)} type="button">
                  <PersonAvatar p={p} size="size-10" />
                  <span className={cn("w-full truncate text-[11px]", p.invited && "text-muted-foreground")}>{p.invited ? "приглашён" : p.name.split(" ")[0]}</span>
                </button>
              }
            />
          ))}
          {Array.from({ length: free }, (_, i) => (
            <button className="flex w-16 flex-col items-center gap-1 rounded-lg p-1 outline-none hover:bg-muted focus-visible:ring-2" key={i} onClick={() => ask({ kind: "invite", tier: t })} type="button">
              <span className="text-muted-foreground flex size-10 items-center justify-center rounded-full border border-dashed">
                <Plus className="size-4" />
              </span>
              <span className="text-muted-foreground text-[11px]">свободно</span>
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 border-t pt-3 text-sm">
          <span className="text-muted-foreground">
            В декабре{s.nextTaken(t) > s.next[t] ? `, занято ${s.nextTaken(t)}` : ""}
          </span>
          <Stepper label={`${TIERS[t].title} в декабре`} onChange={(n) => s.setNext(t, n)} value={s.next[t]} />
        </div>
      </FramePanel>
    </Frame>
  );
};

export const Slots = () => (
  <Screen>
    <div className="flex items-start justify-between gap-3">
      <SettingsHeader description={DESCRIPTION} title="Места" />
      <InviteButton />
    </div>
    <ShortWarnings />
    <div className="flex flex-col gap-3">
      {TIER_ORDER.map((t) => (
        <SeatCard key={t} t={t} />
      ))}
    </div>
    <Section title={`Счёт за ${MONTH.next}`}>
      <NextBill />
    </Section>
    <Section meta="за эту неделю" title="Использование">
      <UsageHead />
      <UsageRows />
    </Section>
  </Screen>
);

// ── 3. Вкладки ───────────────────────────────────────────────────────────────────────────────────────────────────────

const SeatsTab = () => {
  const { s } = useOwner();
  return (
    <div className="flex flex-col gap-6">
      <Rows>
        {TIER_ORDER.map((t) => (
          <Row hint={`занято ${s.taken(t)} из ${s.seats[t]}${s.free(t) === 0 ? " · свободных нет" : `, свободно ${s.free(t)}`}`} key={t} label={TIERS[t].title}>
            <span className="flex items-center gap-3">
              <span className="text-muted-foreground text-xs">в декабре</span>
              <Stepper label={`${TIERS[t].title} в декабре`} onChange={(n) => s.setNext(t, n)} value={s.next[t]} />
            </span>
          </Row>
        ))}
      </Rows>
      <ShortWarnings />
      <div className="flex justify-end">
        <AddButton />
      </div>
      <Section title={`Счёт за ${MONTH.next}`}>
        <NextBill />
      </Section>
    </div>
  );
};

export const TabsView = () => {
  const { knobs } = useProto();
  return (
    <Screen>
      <SettingsHeader description={DESCRIPTION} title="Организация" />
      <Tabs defaultValue={knobs.tab}>
        <TabsList>
          <TabsTrigger value="seats">Места</TabsTrigger>
          <TabsTrigger value="people">Люди</TabsTrigger>
          <TabsTrigger value="usage">Использование</TabsTrigger>
        </TabsList>
        <TabsContent className="pt-4" value="seats">
          <SeatsTab />
        </TabsContent>
        <TabsContent className="flex flex-col gap-3 pt-4" value="people">
          <div className="flex justify-end">
            <InviteButton />
          </div>
          <PeopleRows />
        </TabsContent>
        <TabsContent className="flex flex-col gap-4 pt-4" value="usage">
          <UsageHead />
          <UsageRows />
        </TabsContent>
      </Tabs>
    </Screen>
  );
};
