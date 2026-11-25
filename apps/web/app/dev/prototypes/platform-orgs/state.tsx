"use client";

import { createContext, use, useState } from "react";
import type { ReactNode } from "react";

import { ORGS, PEOPLE, invoiceFor, revenueNow } from "../_orgs/data";
import type { Org, OrgStatus, Person, PersonStatus, Seats } from "../_orgs/data";
import { useProto } from "../memory/frame";

// Состояние P36: что суперюзер поменял руками (отключил, включил, отметил оплату, перенёс срок, завёл организацию) и
// где он сейчас. Экран и организация — в адресе (`scr`, `org`), день — ручка `day`: 25 ноября счета выставлены,
// 28-го — за 3 дня до срока, 1 декабря — неоплаченные отключились сами.

export type Screen = "orgs" | "org" | "people" | "bills" | "new";
export type Day = "25" | "28" | "1";

export interface OrgView extends Org {
  /** За какой месяц не оплачено, если отключена за неоплату. */
  unpaidMonth?: string;
  /** Срок оплаты счёта за декабрь. */
  due: string;
  bill: "issued" | "paid" | "late" | "none";
}

export interface NewOrg {
  name: string;
  ownerEmail: string;
  seats: Seats;
  custom: boolean;
  prices: Partial<Record<keyof Seats, number>>;
  trial: boolean;
  trialUntil: string;
  timezone: string;
  domain: string;
}

const useOrgsState = () => {
  const { knobs, setKnob, say } = useProto();
  const day = (knobs.day ?? "25") as Day;
  const [orgStatus, setOrgStatus] = useState<Record<string, OrgStatus>>({});
  const [personStatus, setPersonStatus] = useState<Record<string, PersonStatus>>({});
  const [paid, setPaid] = useState<Record<string, boolean>>({});
  const [due, setDue] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<Org[]>([]);

  const orgs: OrgView[] = [...ORGS, ...created].map((o) => {
    const isPaid = paid[o.id] ?? o.paid;
    const moved = due[o.id];
    let status = orgStatus[o.id] ?? o.status;
    let unpaidMonth = o.status === "off-unpaid" ? "ноябрь" : undefined;
    // 1 декабря в 00:00 неоплаченная организация отключается сама, если срок не перенесён.
    if (!orgStatus[o.id] && day === "1" && o.status === "active" && !isPaid && !moved) {
      status = "off-unpaid";
      unpaidMonth = "декабрь";
    }
    if (status === "off-unpaid" && paid[o.id]) status = "active";
    const bill: OrgView["bill"] =
      o.status === "trial" ? "none" : isPaid ? "paid" : o.status === "off-unpaid" || (day === "1" && !moved) ? "late" : "issued";
    return { ...o, bill, due: moved ?? "1 декабря", paid: isPaid, status, unpaidMonth: status === "off-unpaid" ? unpaidMonth : undefined };
  });

  const people: Person[] = PEOPLE.map((p) => ({ ...p, status: personStatus[p.id] ?? p.status }));
  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name ?? "";

  const go = (scr: Screen, org?: string) => {
    if (org) setKnob("org", org);
    setKnob("scr", scr);
  };

  return {
    created,
    day,
    disableOrg: (id: string) => {
      setOrgStatus((x) => ({ ...x, [id]: "off-manual" }));
      say(`«${orgName(id)}» отключена`);
    },
    disablePerson: (p: Person) => {
      setPersonStatus((x) => ({ ...x, [p.id]: "off-platform" }));
      say(`${p.name}: отключён платформой, место освобождено`);
    },
    enableOrg: (id: string) => {
      setOrgStatus((x) => ({ ...x, [id]: ORGS.find((o) => o.id === id)?.status === "trial" ? "trial" : "active" }));
      say(`«${orgName(id)}» включена`);
    },
    enablePerson: (p: Person) => {
      setPersonStatus((x) => ({ ...x, [p.id]: "active" }));
      say(`${p.name}: включён`);
    },
    go,
    markPaid: (id: string) => {
      const o = orgs.find((x) => x.id === id);
      setPaid((x) => ({ ...x, [id]: true }));
      say(o?.status === "off-unpaid" ? `«${o.name}»: счёт оплачен, организация включена` : `«${orgName(id)}»: счёт оплачен`);
    },
    moveDue: (id: string, date: string) => {
      setDue((x) => ({ ...x, [id]: date }));
      say(`«${orgName(id)}»: срок перенесён на ${date}`);
    },
    create: (f: NewOrg) => {
      const id = `new-${created.length + 1}`;
      setCreated((c) => [
        ...c,
        {
          created: "сегодня",
          customPrice: f.custom ? f.prices : undefined,
          domains: f.domain ? [f.domain] : [],
          extras: [],
          hitWeek: 0,
          id,
          name: f.name,
          next: f.seats,
          owner: { email: f.ownerEmail, name: "—" },
          paid: false,
          seats: f.seats,
          spend: 0,
          status: f.trial ? "trial" : "active",
          timezone: f.timezone,
          trialUntil: f.trial ? f.trialUntil : undefined,
          used: { basic: 0, max: 0, pro: 0 },
        },
      ]);
      return id;
    },
    org: orgs.find((o) => o.id === (knobs.org ?? "veter")) ?? orgs[0],
    orgs,
    people,
    scr: (knobs.scr ?? "orgs") as Screen,
  };
};

export type OrgsState = ReturnType<typeof useOrgsState>;

const Ctx = createContext<OrgsState>(null as never);

export const OrgsStateProvider = ({ children }: { children: ReactNode }) => <Ctx value={useOrgsState()}>{children}</Ctx>;

export const useOrgs = () => use(Ctx);

/** Неоплаченные счета за декабрь — то, что суперюзер получает за 3 дня до срока. */
export const unpaid = (orgs: OrgView[]) => orgs.filter((o) => o.bill === "issued" || o.bill === "late");

/** Доля расхода на модели от выручки этого месяца без НДС. */
export const modelShare = (o: Org) => {
  const rev = revenueNow(o);
  return rev > 0 ? (o.spend / rev) * 100 : 0;
};

export const toPay = (o: Org) => (o.status === "trial" ? 0 : invoiceFor(o).total);

/** Ссылка-приглашение владельцу новой организации (вид). */
export const inviteLink = (id: string) => `https://app.metobe.example/invite/${id.replace("new-", "k7q2")}x9fm`;
