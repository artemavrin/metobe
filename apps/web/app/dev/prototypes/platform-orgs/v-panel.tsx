"use client";

import { Button } from "@metobe/ui/components/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@metobe/ui/components/sheet";
import { Switch } from "@metobe/ui/components/switch";
import { cn } from "@metobe/ui/lib/utils";
import { Download, Plus } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { Row, Rows, Section } from "@/components/settings/rows";

import { PERSON_STATUS, ROLE_TEXT, money, seatTotal } from "../_orgs/data";
import type { Person } from "../_orgs/data";
import { Dot, NoteBar, OrgStatusBadge, PctBar, PlatformWindow, TariffBadge } from "../_orgs/frame";
import { usePhone } from "../privacy/frame";
import {
  BillMark,
  DueAlert,
  EMPTY_ORG,
  Face,
  InviteResult,
  OrgBills,
  OrgHead,
  OrgNameFields,
  OrgPeople,
  OrgSeatFields,
  OrgSeats,
  OrgTerms,
  OrgTiles,
  SearchField,
  billOrgs,
  isOff,
  matches,
  newOrgError,
  useOrgToggle,
  usePersonToggle,
} from "./parts";
import { toPay, useOrgs } from "./state";
import type { NewOrg, OrgView } from "./state";

// Вариант «Список и панель»: узкий список слева, выбранное — справа, без перехода на другую страницу. В строке
// организации только статус точкой, места и сумма к оплате; остальное — в панели. Человек открывается в боковой
// панели, новая организация — тоже. На телефоне список во весь экран, выбранное — следующим экраном.

const statusTone = (o: OrgView) => (o.status === "off-unpaid" ? "bad" : o.status === "off-manual" ? "warn" : o.status === "trial" ? "info" : o.bill === "late" ? "bad" : "ok");

const ListPane = ({ head, children }: { head: ReactNode; children: ReactNode }) => (
  <div className="flex min-h-0 w-80 shrink-0 flex-col border-r max-sm:w-full max-sm:border-r-0">
    <div className="flex flex-col gap-2 border-b p-3">{head}</div>
    <ul className="min-h-0 flex-1 overflow-y-auto">{children}</ul>
  </div>
);

const ListItem = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) => (
  <li>
    <button
      className={cn("hover:bg-muted/50 flex w-full items-center gap-3 border-b px-3 py-2.5 text-left transition-colors", active && "bg-muted")}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  </li>
);

const Detail = ({ children }: { children: ReactNode }) => (
  <div className="@container min-w-0 flex-1 overflow-y-auto">
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 pt-6 pb-24 max-sm:px-4 max-sm:pt-4">{children}</div>
  </div>
);

const NewOrgSheet = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const s = useOrgs();
  const phone = usePhone();
  const [f, setF] = useState<NewOrg>(EMPTY_ORG);
  const [done, setDone] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const error = newOrgError(f);
  const close = () => {
    onClose();
    setTimeout(() => {
      setF(EMPTY_ORG);
      setDone(null);
      setTried(false);
    }, 200);
  };
  return (
    <Sheet onOpenChange={(o) => !o && close()} open={open}>
      <SheetContent className={cn("gap-0", phone ? "max-h-[92dvh] rounded-t-2xl" : "data-[side=right]:w-[480px] data-[side=right]:sm:max-w-[480px]")} side={phone ? "bottom" : "right"}>
        <SheetHeader>
          <SheetTitle>Новая организация</SheetTitle>
          {!done && <SheetDescription>Владелец получит ссылку-приглашение и сам пригласит людей на места.</SheetDescription>}
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
          {done ? (
            <InviteResult
              f={f}
              id={done}
              onOpen={() => {
                close();
                s.go("org", done);
              }}
            />
          ) : (
            <>
              <OrgNameFields f={f} set={setF} />
              <OrgSeatFields f={f} set={setF} />
              {tried && error && <p className="text-destructive text-sm">{error}</p>}
            </>
          )}
        </div>
        {!done && (
          <SheetFooter className="border-t">
            <Button
              onClick={() => {
                setTried(true);
                if (!error) setDone(s.create(f));
              }}
            >
              Завести и пригласить
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
};

const OrgsScreen = () => {
  const s = useOrgs();
  const phone = usePhone();
  const toggle = useOrgToggle();
  const person = usePersonToggle();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(s.scr === "new");
  const list = s.orgs.filter((o) => matches(q, o.name, o.owner.name, o.owner.email));
  const detail = s.scr === "org" || !phone;
  const o = s.org;
  return (
    <div className="flex h-full min-h-0">
      {(!phone || !detail) && (
        <ListPane
          head={
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">Организации</span>
                <Button aria-label="Новая организация" onClick={() => setCreating(true)} size="icon-sm" variant="outline">
                  <Plus />
                </Button>
              </div>
              <SearchField className="max-w-none" onChange={setQ} placeholder="Найти" value={q} />
            </>
          }
        >
          {list.map((x) => (
            <ListItem active={!phone && x.id === o.id} key={x.id} onClick={() => s.go("org", x.id)}>
              <Dot tone={statusTone(x)} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={cn("truncate font-medium", isOff(x) && "text-muted-foreground")}>{x.name}</span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {seatTotal(x.used)} из {seatTotal(x.seats)} мест
                </span>
              </span>
              <span className="flex flex-col items-end text-xs tabular-nums">
                {x.status === "trial" ? <span className="text-muted-foreground">пробная</span> : money(toPay(x))}
                <BillMark o={x} />
              </span>
            </ListItem>
          ))}
        </ListPane>
      )}
      {detail && (
        <Detail>
          <OrgHead ask={toggle.ask} o={o} />
          <DueAlert />
          <OrgTiles o={o} />
          <OrgPeople o={o} onToggle={person.ask} />
          <OrgBills o={o} />
          <OrgSeats o={o} />
          <OrgTerms o={o} />
        </Detail>
      )}
      <NewOrgSheet
        onClose={() => {
          setCreating(false);
          if (s.scr === "new") s.go("orgs");
        }}
        open={creating}
      />
      {toggle.dialog}
      {person.dialog}
    </div>
  );
};

const PersonSheet = ({ p, onClose, onToggle }: { p: Person | null; onClose: () => void; onToggle: (p: Person) => void }) => {
  const s = useOrgs();
  const phone = usePhone();
  const off = p?.status === "off-platform" || p?.status === "off-owner";
  return (
    <Sheet onOpenChange={(o) => !o && onClose()} open={p !== null}>
      <SheetContent className={cn("gap-0", phone ? "max-h-[88dvh] rounded-t-2xl" : "data-[side=right]:w-[420px] data-[side=right]:sm:max-w-[420px]")} side={phone ? "bottom" : "right"}>
        {p && (
          <>
            <SheetHeader>
              <SheetTitle>{p.name}</SheetTitle>
              <SheetDescription>
                {p.email} · {s.orgs.find((o) => o.id === p.org)?.name}, {ROLE_TEXT[p.role]}
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
              <Rows>
                <Row label="Тариф">
                  <TariffBadge id={p.tariff} />
                </Row>
                <Row hint="Сброс в понедельник, 00:00" label="Неделя">
                  <PctBar value={p.status === "active" ? p.week : 0} />
                </Row>
                <Row hint={p.five === null ? "У тарифа Макс окна нет" : "Сброс через 5 часов после первого запроса"} label="5 часов">
                  <PctBar value={p.status === "active" ? p.five : 0} />
                </Row>
                <Row label="Расход за ноябрь">{money(p.spend)}</Row>
                <Row label="Упирался в неделю">{p.hits ? `${p.hits} раза в ноябре` : "нет"}</Row>
                <Row label="Последний вход">{p.lastSeen}</Row>
                <Row label="Состояние">{PERSON_STATUS[p.status]}</Row>
              </Rows>
              {p.status === "off-platform" && <p className="text-muted-foreground text-xs">Отключён платформой: владелец организации включить не может.</p>}
            </div>
            {p.role !== "owner" && (
              <SheetFooter className="border-t">
                <Button
                  onClick={() => {
                    onToggle(p);
                    onClose();
                  }}
                  variant={off ? "default" : "destructive"}
                >
                  {off ? "Включить" : "Отключить"}
                </Button>
              </SheetFooter>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

const PeopleScreen = () => {
  const s = useOrgs();
  const person = usePersonToggle();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Person | null>(null);
  const name = (id: string) => s.orgs.find((o) => o.id === id)?.name ?? "";
  const list = s.people.filter((p) => matches(q, p.name, p.email, name(p.org)));
  return (
    <Detail>
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold tracking-tight max-sm:hidden">Люди</h1>
        <SearchField className="max-w-sm" onChange={setQ} placeholder="Имя, почта или организация" value={q} />
      </div>
      <ul className="divide-y rounded-lg border">
        {list.map((p) => (
          <li key={p.id}>
            <button className="hover:bg-muted/40 flex w-full items-center gap-3 px-3 py-2.5 text-left" onClick={() => setOpen(p)} type="button">
              <Face name={p.name} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={cn("truncate font-medium", p.status !== "active" && "text-muted-foreground")}>{p.name}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {name(p.org)}
                  {p.status !== "active" ? ` · ${PERSON_STATUS[p.status]}` : ""}
                </span>
              </span>
              <TariffBadge id={p.tariff} />
              <span className="max-sm:hidden">{p.status === "active" && <PctBar label="Неделя" value={p.week} />}</span>
            </button>
          </li>
        ))}
      </ul>
      <PersonSheet onClose={() => setOpen(null)} onToggle={person.ask} p={open ? (s.people.find((x) => x.id === open.id) ?? open) : null} />
      {person.dialog}
    </Detail>
  );
};

const BillsScreen = () => {
  const s = useOrgs();
  const list = billOrgs(s.orgs);
  return (
    <Detail>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight max-sm:hidden">Счета за декабрь</h1>
          <p className="text-muted-foreground">Выставлены 25 ноября, срок — 1 декабря. Выключатель — отметка «Оплачен».</p>
        </div>
        <Button size="sm" variant="outline">
          <Download />
          CSV
        </Button>
      </div>
      <DueAlert />
      <Section meta={money(list.reduce((a, o) => a + toPay(o), 0))} title="Декабрь">
        <Rows>
          {list.map((o) => (
            <Row hint={o.bill === "paid" ? "Оплачен" : o.bill === "late" ? "Просрочен — организация отключена" : `Срок ${o.due}`} key={o.id} label={o.name}>
              <span className="flex items-center justify-end gap-3">
                <span className="tabular-nums">{money(toPay(o))}</span>
                <Switch aria-label={`Оплачен: ${o.name}`} checked={o.bill === "paid"} disabled={o.bill === "paid"} onCheckedChange={() => s.markPaid(o.id)} />
              </span>
            </Row>
          ))}
        </Rows>
      </Section>
      <p className="text-muted-foreground text-xs">
        Без счёта, пробные:{" "}
        {s.orgs
          .filter((o) => o.status === "trial")
          .map((o) => (
            <span className="inline-flex items-center gap-1" key={o.id}>
              {o.name} <OrgStatusBadge status={o.status} trialUntil={o.trialUntil} />
            </span>
          ))}
      </p>
    </Detail>
  );
};

export const PanelVariant = () => {
  const s = useOrgs();
  const phone = usePhone();
  const page = s.scr === "people" ? "people" : s.scr === "bills" ? "bills" : "orgs";
  const title = s.scr === "org" && phone ? s.org.name : page === "people" ? "Люди" : page === "bills" ? "Счета" : "Организации";
  return (
    <PlatformWindow
      back={phone && s.scr === "org" ? () => s.go("orgs") : undefined}
      onNavigate={(p) => {
        if (p === "orgs" || p === "people" || p === "bills") {
          s.go(p);
          return true;
        }
        return false;
      }}
      page={page}
      title={title}
    >
      {page === "people" ? <PeopleScreen /> : page === "bills" ? <BillsScreen /> : <OrgsScreen />}
      <NoteBar />
    </PlatformWindow>
  );
};
