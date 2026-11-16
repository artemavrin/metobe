"use client";

import type { MemoryCard, MemoryCardItem, MemoryRecordView } from "@metobe/contracts/memory";
import { Toaster } from "@metobe/ui/components/sonner";
import { useEffect, useState } from "react";

import { AnswerCard, AnswerPromises } from "@/components/chat/answer-memory";
import type { CardPart, PromisesPart } from "@/lib/answer-work";

import { Picker } from "../_shared/picker";
import { Params, ProtoProvider, useProto } from "../memory/frame";

// P25 · карточка и список обещаний в ответе (Д1): настоящие виджеты чата `AnswerCard` и `AnswerPromises`, запросы к
// `/api/memory/*` подменены данными прототипа — «Выполнено», «Перенести срок» и «Удалить» работают на них, а не на
// памяти человека. В адресе: `?v=1&fill=many&st=ready&sz=phone`.

const DAY = 86_400_000;
const at = (days: number) => new Date(Date.now() + days * DAY).toISOString();
const SHOWN = 12;

const ME = { id: "self", kind: "self" as const, name: "Я" };
const IRINA = { id: "11111111-1111-4111-8111-111111111111", kind: "person" as const, name: "Ирина Белова" };
const VECTOR = { id: "22222222-2222-4222-8222-222222222222", kind: "org" as const, name: "ООО «Вектор»" };

const TEXTS: [string, number | null, "them" | "me" | "vector", boolean?][] = [
  ["Доделать вторую версию портала", -2, "them"],
  ["Прислать план работ на декабрь", 2, "them"],
  ["Согласовать её отпуск на январь", 0, "me"],
  ["Передать доступы к складской системе", 5, "them"],
  ["Подписать акт сверки", 7, "me"],
  ["Подготовить отчёт по закупкам", 9, "them", true],
  ["Выслать договор на проверку юристам", 10, "me"],
  ["Обновить список поставщиков", 12, "them"],
  ["Ответить на письмо о поставке", 14, "me"],
  ["Согласовать смету на ремонт склада", 15, "vector"],
  ["Прислать фотографии с приёмки", 18, "them"],
  ["Провести пересчёт остатков", 21, "them"],
  ["Уточнить сроки по второму этапу", 24, "vector"],
  ["Пересмотреть график дежурств", null, "me"],
];

const make = (i: number): MemoryRecordView => {
  const [text, due, who, important] = TEXTS[i] as (typeof TEXTS)[number];
  const debtor = who === "me" ? ME : who === "vector" ? VECTOR : IRINA;
  const creditor = who === "me" ? IRINA : ME;
  return {
    chatId: null,
    deletedAt: null,
    doneAt: null,
    dueAt: due === null ? null : at(due),
    entities: [
      { ...debtor, role: "debtor" },
      { ...creditor, role: "creditor" },
    ],
    fromChat: false,
    givenAt: at(-6 - i),
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    important: Boolean(important),
    kind: "commitment",
    occurredAt: null,
    occurredPrecision: null,
    recordedAt: at(-6 - i),
    status: "open",
    supersededAt: null,
    text,
    validFrom: null,
    validTo: null,
  };
};

const CARD: MemoryCardItem = {
  aliases: [],
  email: null,
  id: IRINA.id,
  kind: "person",
  name: IRINA.name,
  open: 0,
  overdue: 0,
  phone: null,
  role: "Заместитель",
  type: null,
};

const FILL: Record<string, number> = { few: 3, many: 14, none: 0 };

/** Состояние прототипа: записи, которые «правит» человек. Живёт, пока открыта страница. */
let records: MemoryRecordView[] = [];
const reset = (fill: string) => {
  records = Array.from({ length: FILL[fill] ?? 3 }, (_, i) => make(i));
};

const urgency = (a: MemoryRecordView, b: MemoryRecordView) =>
  Number(b.important) - Number(a.important) || (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999");
const isOpen = (r: MemoryRecordView) => r.status === "open";

const cardNow = (): MemoryCard => {
  const open = records.filter(isOpen);
  return {
    card: { ...CARD, open: open.length, overdue: open.filter((r) => r.dueAt && r.dueAt < at(0)).length },
    contact: { every: 14, last: at(-9) },
    records,
  };
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status });

/** Подменяет запросы виджетов к памяти; возвращает, как снять подмену. */
const install = () => {
  const real = window.fetch;
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
    const method = init?.method ?? "GET";
    const one = /\/api\/memory\/records\/([^/]+)(?:\/(restore))?$/u.exec(url);
    if (url.startsWith("/api/memory/cards/")) {
      return json(cardNow());
    }
    if (url === "/api/memory/records/lookup") {
      const { ids } = JSON.parse(String(init?.body)) as { ids: string[] };
      return json({ records: records.filter((r) => ids.includes(r.id) && !r.deletedAt) });
    }
    if (one) {
      const r = records.find((x) => x.id === one[1]);
      if (!r) return json({ error: "not-found" }, 404);
      if (one[2] === "restore") r.deletedAt = null;
      else if (method === "DELETE") r.deletedAt = new Date().toISOString();
      else if (method === "PATCH") {
        const patch = JSON.parse(String(init?.body)) as { status?: MemoryRecordView["status"]; dueAt?: string | null; important?: boolean };
        if (patch.status) {
          r.status = patch.status;
          r.doneAt = patch.status === "done" ? new Date().toISOString() : null;
        }
        if ("dueAt" in patch) r.dueAt = patch.dueAt ?? null;
        if (patch.important !== undefined) r.important = patch.important;
      }
      records = records.filter((x) => !x.deletedAt || x.id === r.id);
      return json({ updated: true });
    }
    return real(input, init);
  };
  return () => {
    window.fetch = real;
  };
};

const cardPart = (state: CardPart["state"]): CardPart => {
  const open = records.filter(isOpen).sort(urgency);
  return {
    input: { name: "Ирина" },
    output: {
      card: cardNow().card,
      contact: { every: 14, last: at(-9) },
      found: true,
      moreOpen: Math.max(0, open.length - SHOWN),
      open: open.slice(0, SHOWN),
    },
    state,
    toolCallId: "card",
    type: "tool-show_card",
  } as CardPart;
};

const promisesPart = (state: PromisesPart["state"], one: boolean): PromisesPart => {
  const open = records
    .filter(isOpen)
    .filter((r) => !one || r.entities.some((e) => e.id === IRINA.id))
    .sort(urgency);
  return {
    input: {},
    output: {
      card: one ? { id: IRINA.id, name: IRINA.name } : null,
      more: Math.max(0, open.length - SHOWN),
      records: open.slice(0, SHOWN),
      today: at(0).slice(0, 10),
    },
    state,
    toolCallId: "promises",
    type: "tool-show_promises",
  } as PromisesPart;
};

/** Колонка чата: на компьютере — ширина ответа, на телефоне — кадр 390 px. */
const Column = ({ children }: { children: React.ReactNode }) => {
  const { screen } = useProto();
  return (
    <div className="bg-background min-h-svh p-4">
      <div className={screen === "phone" ? "mx-auto w-[390px] border-x px-3" : "mx-auto w-full max-w-3xl"}>
        <p className="text-muted-foreground py-6 text-sm">Что у меня с Ириной?</p>
        {children}
        <p className="py-4 text-sm">Два срока горят — доделать портал просрочено на два дня, план работ нужен к пятнице.</p>
      </div>
    </div>
  );
};

const Stage = ({ children }: { children: (building: boolean) => React.ReactNode }) => {
  const { knobs } = useProto();
  const [ready, setReady] = useState(false);
  // Данные и подмена запросов — один раз на страницу и на выбранное «записей».
  useState(() => {
    if (typeof window !== "undefined") reset(knobs.fill ?? "few");
    return null;
  });
  useEffect(() => {
    reset(knobs.fill ?? "few");
    const restore = install();
    setReady(true);
    return restore;
  }, [knobs.fill]);
  return (
    <Column>
      {ready ? children(knobs.st === "building") : null}
      <Toaster position="bottom-right" />
    </Column>
  );
};

const Variants = {
  card: () => (
    <Stage>
      {(building) => <AnswerCard key={building ? "b" : "r"} part={cardPart(building ? "input-available" : "output-available")} />}
    </Stage>
  ),
  list: () => (
    <Stage>
      {(building) => <AnswerPromises key={building ? "b" : "r"} part={promisesPart(building ? "input-available" : "output-available", false)} />}
    </Stage>
  ),
  one: () => (
    <Stage>
      {(building) => <AnswerPromises key={building ? "b" : "r"} part={promisesPart(building ? "input-available" : "output-available", true)} />}
    </Stage>
  ),
};

const MemoryInAnswerPage = () => (
  <ProtoProvider defaults={{ fill: "many", st: "ready" }}>
    <Picker
      params={
        <Params
          rows={[
            ["fill", "записей", [["many", "много"], ["few", "мало"], ["none", "нет"]]],
            ["st", "вид", [["ready", "готово"], ["building", "строится"]]],
          ]}
        />
      }
      variants={[
        { Component: Variants.card, name: "Карточка", pickerTop: true },
        { Component: Variants.list, name: "Список", pickerTop: true },
        { Component: Variants.one, name: "Список карточки", pickerTop: true },
      ]}
    />
  </ProtoProvider>
);

export default MemoryInAnswerPage;
