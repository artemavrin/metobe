"use client";

import { Button } from "@metobe/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@metobe/ui/components/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@metobe/ui/components/tabs";
import { ToggleGroup, ToggleGroupItem } from "@metobe/ui/components/toggle-group";
import { cn } from "@metobe/ui/lib/utils";
import { ChevronLeft, Download, Plus } from "lucide-react";
import { useState } from "react";

import { SettingsHeader, SettingsPageFrame } from "@/components/settings/settings-shell";

import { TARIFF_IDS, money, seatTotal, tariffById } from "../_orgs/data";
import { NoteBar, OrgStatusBadge, PlatformWindow, WideFrame } from "../_orgs/frame";
import { usePhone } from "../privacy/frame";
import {
  BillMark,
  BillState,
  DueAlert,
  EMPTY_ORG,
  InviteResult,
  OrgBills,
  OrgHead,
  OrgMenu,
  OrgNameFields,
  OrgPeople,
  OrgSeatFields,
  OrgSeats,
  OrgTerms,
  OrgTiles,
  PeopleTable,
  SearchField,
  SeatsLine,
  ShareText,
  billOrgs,
  isOff,
  matches,
  newOrgError,
  useOrgToggle,
  usePersonToggle,
} from "./parts";
import { toPay, useOrgs } from "./state";
import type { NewOrg, OrgView } from "./state";

// Вариант «Таблица»: всё — таблицами со столбцами, как в админке. Организация — отдельная страница с вкладками
// «Люди / Места / Счета / Условия»; новая организация — окно поверх списка. На телефоне строки таблиц — карточки.

type Filter = "all" | "active" | "trial" | "off";

const FILTERS: [Filter, string][] = [
  ["all", "Все"],
  ["active", "Активные"],
  ["trial", "Пробные"],
  ["off", "Отключённые"],
];

const byFilter = (o: OrgView, f: Filter) => f === "all" || (f === "off" ? isOff(o) : o.status === f);

const OrgList = () => {
  const s = useOrgs();
  const phone = usePhone();
  const toggle = useOrgToggle();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [creating, setCreating] = useState(s.scr === "new");
  const list = s.orgs.filter((o) => byFilter(o, filter) && matches(q, o.name, o.owner.name, o.owner.email));
  return (
    <WideFrame>
      <div className="flex items-start justify-between gap-4">
        <SettingsHeader description="Все организации установки: места, счета и расход на модели." title="Организации" />
        <Button onClick={() => setCreating(true)} size={phone ? "icon" : "default"}>
          <Plus />
          {!phone && "Новая организация"}
        </Button>
      </div>
      <DueAlert />
      <div className="flex flex-wrap items-center gap-2">
        <SearchField onChange={setQ} placeholder="Название, владелец, почта" value={q} />
        <ToggleGroup onValueChange={(v) => v[0] && setFilter(v[0] as Filter)} value={[filter]} size="sm" spacing={0} variant="outline">
          {FILTERS.map(([id, label]) => (
            <ToggleGroupItem key={id} value={id}>
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {phone ? (
        <ul className="divide-y rounded-lg border">
          {list.map((o) => (
            <li className="flex items-start gap-2 px-3 py-3" key={o.id}>
              <button className="flex min-w-0 flex-1 flex-col gap-1.5 text-left" onClick={() => s.go("org", o.id)} type="button">
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium">{o.name}</span>
                  <OrgStatusBadge short status={o.status} />
                </span>
                <span className="text-muted-foreground truncate text-xs">{o.owner.email}</span>
                <SeatsLine seats={o.seats} used={o.used} />
                <span className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Декабрь</span>
                  <span className="flex items-center gap-1.5 tabular-nums">
                    {o.status === "trial" ? "пробная" : money(toPay(o))}
                    <BillMark o={o} />
                  </span>
                </span>
              </button>
              <OrgMenu ask={toggle.ask} o={o} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
            <thead className="text-muted-foreground bg-muted/40 text-left text-xs">
              <tr>
                <th className="px-4 py-2 font-medium">Организация</th>
                <th className="px-3 py-2 font-medium">Статус</th>
                <th className="px-3 py-2 font-medium">Места: занято из</th>
                <th className="px-3 py-2 text-right font-medium">К оплате за декабрь</th>
                <th className="px-3 py-2 text-right font-medium">Модели за ноябрь</th>
                <th className="px-3 py-2 text-right font-medium">Упирались</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {list.map((o) => (
                <tr className={cn("hover:bg-muted/40 cursor-pointer", isOff(o) && "text-muted-foreground")} key={o.id} onClick={() => s.go("org", o.id)}>
                  <td className="px-4 py-2.5">
                    <span className="flex flex-col">
                      <span className="text-foreground font-medium">{o.name}</span>
                      <span className="text-muted-foreground text-xs">{o.owner.email}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <OrgStatusBadge short status={o.status} />
                  </td>
                  <td className="px-3 py-2.5">
                    <SeatsLine seats={o.seats} used={o.used} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums">
                      {o.status === "trial" ? <span className="text-muted-foreground">пробная</span> : money(toPay(o))}
                      <BillMark o={o} />
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <ShareText o={o} />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{o.hitWeek || "—"}</td>
                  <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <OrgMenu ask={toggle.ask} o={o} open={() => s.go("org", o.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <NewOrgDialog
        onClose={() => {
          setCreating(false);
          if (s.scr === "new") s.go("orgs");
        }}
        open={creating}
      />
      {toggle.dialog}
    </WideFrame>
  );
};

const NewOrgDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const s = useOrgs();
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
    <Dialog onOpenChange={(o) => !o && close()} open={open}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Новая организация</DialogTitle>
          {!done && <DialogDescription>Владелец получит ссылку-приглашение и сам пригласит людей на места.</DialogDescription>}
        </DialogHeader>
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
          <div className="flex flex-col gap-4">
            <OrgNameFields f={f} set={setF} />
            <OrgSeatFields f={f} set={setF} />
            {tried && error && <p className="text-destructive text-sm">{error}</p>}
          </div>
        )}
        {!done && (
          <DialogFooter>
            <Button onClick={close} variant="outline">
              Отмена
            </Button>
            <Button
              onClick={() => {
                setTried(true);
                if (!error) setDone(s.create(f));
              }}
            >
              Завести и пригласить
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
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
      <Tabs defaultValue="people">
        <TabsList variant="line">
          <TabsTrigger value="people">Люди</TabsTrigger>
          <TabsTrigger value="seats">Места</TabsTrigger>
          <TabsTrigger value="bills">Счета</TabsTrigger>
          <TabsTrigger value="terms">Условия</TabsTrigger>
        </TabsList>
        <TabsContent className="pt-4" value="people">
          <OrgPeople o={o} onToggle={person.ask} />
        </TabsContent>
        <TabsContent className="pt-4" value="seats">
          <OrgSeats o={o} />
        </TabsContent>
        <TabsContent className="pt-4" value="bills">
          <OrgBills o={o} />
        </TabsContent>
        <TabsContent className="pt-4" value="terms">
          <OrgTerms o={o} />
        </TabsContent>
      </Tabs>
      {toggle.dialog}
      {person.dialog}
    </SettingsPageFrame>
  );
};

const PeoplePage = () => {
  const s = useOrgs();
  const person = usePersonToggle();
  const [q, setQ] = useState("");
  const [org, setOrg] = useState("all");
  const list = s.people.filter((p) => (org === "all" || p.org === org) && matches(q, p.name, p.email));
  return (
    <WideFrame>
      <SettingsHeader description="Все люди всех организаций. Отключённый платформой не входит, владелец его не включит." title="Люди" />
      <div className="flex flex-wrap items-center gap-2">
        <SearchField onChange={setQ} placeholder="Имя или почта" value={q} />
        <ToggleGroup className="max-w-full overflow-x-auto" onValueChange={(v) => v[0] && setOrg(v[0])} value={[org]} size="sm" spacing={0} variant="outline">
          <ToggleGroupItem value="all">
            Все
          </ToggleGroupItem>
          {s.orgs.slice(0, 4).map((o) => (
            <ToggleGroupItem key={o.id} value={o.id}>
              {o.name}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <PeopleTable onToggle={person.ask} people={list} showOrg />
      {person.dialog}
    </WideFrame>
  );
};

const BillsPage = () => {
  const s = useOrgs();
  const phone = usePhone();
  const list = billOrgs(s.orgs);
  const total = list.reduce((a, o) => a + toPay(o), 0);
  const paid = list.filter((o) => o.bill === "paid").reduce((a, o) => a + toPay(o), 0);
  return (
    <WideFrame>
      <div className="flex items-start justify-between gap-4">
        <SettingsHeader description={`Декабрь: выставлено 25 ноября на ${money(total)}, оплачено ${money(paid)}.`} title="Счета" />
        <Button size={phone ? "icon" : "default"} variant="outline">
          <Download />
          {!phone && "CSV"}
        </Button>
      </div>
      <DueAlert />
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
          <thead className="text-muted-foreground bg-muted/40 text-left text-xs">
            <tr>
              <th className="px-4 py-2 font-medium">Организация</th>
              {!phone && <th className="px-3 py-2 font-medium">Места</th>}
              <th className="px-3 py-2 text-right font-medium">Сумма с НДС</th>
              <th className="px-3 py-2 font-medium">Статус</th>
              {!phone && <th className="px-3 py-2 font-medium">Срок</th>}
              <th className="w-12" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {list.map((o) => (
              <tr key={o.id}>
                <td className="px-4 py-2.5 font-medium">{o.name}</td>
                {!phone && (
                  <td className="px-3 py-2.5 text-xs tabular-nums">
                    {TARIFF_IDS.filter((t) => o.next[t]).map((t) => `${tariffById(t).name} ${o.next[t]}`).join(" · ")}
                  </td>
                )}
                <td className="px-3 py-2.5 text-right tabular-nums">{money(toPay(o))}</td>
                <td className="px-3 py-2.5">
                  <BillState o={o} />
                </td>
                {!phone && <td className="text-muted-foreground px-3 py-2.5">{o.bill === "paid" ? "—" : o.due}</td>}
                <td className="px-2 py-2.5 text-right">
                  {o.bill !== "paid" && (
                    <Button onClick={() => s.markPaid(o.id)} size="sm" variant="outline">
                      Оплачен
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground text-xs">
        Пробные организации без счёта: {s.orgs.filter((o) => o.status === "trial").map((o) => `${o.name} (до ${o.trialUntil})`).join(", ")}. Мест в счетах — {list.reduce((a, o) => a + seatTotal(o.next), 0)}.
      </p>
    </WideFrame>
  );
};

const TITLES = { bills: "Счета", new: "Организации", org: "Организация", orgs: "Организации", people: "Люди" } as const;

export const TableVariant = () => {
  const s = useOrgs();
  const page = s.scr === "people" ? "people" : s.scr === "bills" ? "bills" : "orgs";
  return (
    <PlatformWindow
      back={s.scr === "org" ? () => s.go("orgs") : undefined}
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
      {s.scr === "org" ? <OrgPage /> : s.scr === "people" ? <PeoplePage /> : s.scr === "bills" ? <BillsPage /> : <OrgList />}
      <NoteBar />
    </PlatformWindow>
  );
};
