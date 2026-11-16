"use client";

import { cn } from "@metobe/ui/lib/utils";
import { Building2, FolderKanban, Plug, UserRound } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { Picker } from "../_shared/picker";
import { ENTER, Params, ProtoProvider, useProto } from "../memory/frame";

// P26 · упоминание карточки памяти в сообщении (Д4). Сегодня `@` упоминает MCP-сервер: только упомянутые серверы
// дают модели свои инструменты. Карточка памяти — другое: она кладёт в ответ то, что о ней известно. Как не смешать:
// «Одно меню» — `@` показывает две группы, «Серверы» и «Память»; «Отдельный знак» — `@` только серверы, `#` — память.
// Названное подсвечено в самом тексте. Два Андрея — чтобы видно было, как их различить. Печатать в поле можно.
// В адресе: `?v=1&sz=phone`.

type Kind = "server" | "person" | "org" | "project";
interface Entry { id: string; name: string; note: string; kind: Kind }

const SERVERS: Entry[] = [
  { id: "s1", kind: "server", name: "Почта", note: "письма и рассылки" },
  { id: "s2", kind: "server", name: "Таблицы", note: "отчёты и выгрузки" },
  { id: "s3", kind: "server", name: "Трекер", note: "задачи команды" },
];
const CARDS: Entry[] = [
  { id: "c1", kind: "person", name: "Андрей Петров", note: "Разработчик · открыто 2" },
  { id: "c2", kind: "person", name: "Андрей Седов", note: "Бухгалтер · открыто 1" },
  { id: "c3", kind: "person", name: "Ольга Ли", note: "Юрист · ничего открытого" },
  { id: "c4", kind: "org", name: "ООО «Вектор»", note: "Поставщик · открыто 3" },
  { id: "c5", kind: "project", name: "Склад 2.0", note: "Проект · открыто 5" },
];

const ICON = { org: Building2, person: UserRound, project: FolderKanban, server: Plug } as const;

/** Слово под курсором, которое начинается со знака: `@Анд`, `#Ол`. */
const wordAt = (text: string, caret: number) => {
  const before = text.slice(0, caret);
  const m = /(?:^|\s)([@#])([^\s@#]*)$/u.exec(before);
  return m ? { query: m[2] ?? "", sign: m[1] as "@" | "#", start: caret - (m[2]?.length ?? 0) - 1 } : null;
};

const norm = (s: string) => s.toLocaleLowerCase("ru").replaceAll("ё", "е");

const Composer = ({ split }: { split: boolean }) => {
  const { screen } = useProto();
  const [text, setText] = useState("Что мне ответить @Ольга Ли про договор? ");
  const [caret, setCaret] = useState(text.length);
  const [at, setAt] = useState(0);
  const [mentions, setMentions] = useState<Entry[]>([CARDS[2] as Entry]);
  const ref = useRef<HTMLTextAreaElement>(null);
  const word = wordAt(text, caret);

  // Что предлагает меню: в «Одном меню» — обе группы по `@`; в «Отдельном знаке» `@` — серверы, `#` — память.
  const groups = useMemo(() => {
    if (!word) return [];
    const q = norm(word.query);
    // По началу слова в названии или подписи: «анд» — Андрей, но не «команды».
    const fit = (list: Entry[]) => list.filter((e) => norm(`${e.name} ${e.note}`).split(/[\s·«»]+/u).some((w) => w.startsWith(q)));
    const servers = split && word.sign === "#" ? [] : fit(SERVERS);
    const cards = split && word.sign === "@" ? [] : fit(CARDS);
    return [
      ...(servers.length > 0 ? [{ items: servers, title: "Серверы" }] : []),
      ...(cards.length > 0 ? [{ items: cards, title: "Память" }] : []),
    ];
  }, [split, word]);
  const flat = groups.flatMap((g) => g.items);
  const open = Boolean(word) && flat.length > 0;

  const pick = (e: Entry) => {
    if (!word) return;
    const sign = word.sign;
    const head = text.slice(0, word.start);
    const tail = text.slice(caret);
    const insert = `${sign}${e.name} `;
    setText(`${head}${insert}${tail}`);
    setMentions((m) => (m.some((x) => x.id === e.id) ? m : [...m, e]));
    const pos = head.length + insert.length;
    setCaret(pos);
    setAt(0);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
    });
  };

  // Подсветка названного: слой под полем с тем же шрифтом, поле над ним прозрачное.
  const names = mentions.map((m) => `${split && m.kind !== "server" ? "#" : "@"}${m.name}`);
  const layer = names.length === 0 ? [text] : text.split(new RegExp(`(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "u"));
  const kindOf = (chunk: string) => mentions.find((m) => chunk.endsWith(m.name) && names.includes(chunk));

  return (
    <div className="bg-background min-h-svh px-4 pt-[45svh] pb-10">
      <div className={cn("mx-auto flex flex-col gap-3", screen === "phone" ? "w-[390px]" : "max-w-2xl")}>
        <p className="text-muted-foreground px-1 text-sm">
          {split ? "«@» — серверы, «#» — память. Наберите «#And» или «@Поч»." : "«@» — серверы и память в одном меню. Наберите «@And» или «@Поч»."}
        </p>
        <div className="relative">
          {open && (
            <div className={cn("bg-popover absolute right-0 bottom-full left-0 z-10 mb-2 max-h-72 overflow-y-auto rounded-xl border p-1 shadow-md", ENTER)} role="listbox">
              {groups.map((g) => (
                <div key={g.title}>
                  <div className="text-muted-foreground px-2 pt-1.5 pb-1 text-xs font-medium">{g.title}</div>
                  {g.items.map((e) => {
                    const i = flat.indexOf(e);
                    const Icon = ICON[e.kind];
                    return (
                      <button
                        aria-selected={i === at}
                        className={cn("flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm", i === at && "bg-muted")}
                        key={e.id}
                        onMouseDown={(ev) => { ev.preventDefault(); pick(e); }}
                        onMouseEnter={() => setAt(i)}
                        role="option"
                        type="button"
                      >
                        <span className="bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full"><Icon className="size-3.5" /></span>
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate">{e.name}</span>
                          <span className="text-muted-foreground truncate text-xs">{e.note}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
          <div className="bg-card relative rounded-2xl border p-3">
            <div aria-hidden className="pointer-events-none min-h-24 text-sm leading-6 break-words whitespace-pre-wrap">
              {layer.map((chunk, i) => {
                const m = kindOf(chunk);
                return m ? (
                  <mark className={cn("rounded-md", m.kind === "server" ? "bg-primary/10 text-primary" : "bg-warning/20 text-foreground")} key={`${chunk}${i}`}>{chunk}</mark>
                ) : (
                  <span key={`${i}-${chunk}`}>{chunk}</span>
                );
              })}
              {"​"}
            </div>
            <textarea
              aria-label="Сообщение"
              className="caret-foreground absolute inset-3 resize-none bg-transparent text-sm leading-6 break-words whitespace-pre-wrap text-transparent outline-none"
              onChange={(e) => { setText(e.target.value); setCaret(e.target.selectionStart); setAt(0); }}
              onKeyDown={(e) => {
                if (!open) return;
                if (e.key === "ArrowDown") { e.preventDefault(); setAt((n) => (n + 1) % flat.length); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setAt((n) => (n - 1 + flat.length) % flat.length); }
                else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(flat[at] as Entry); }
                else if (e.key === "Escape") { e.preventDefault(); setCaret(0); }
              }}
              onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
              ref={ref}
              spellCheck={false}
              value={text}
            />
          </div>
        </div>
        <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs">
          <span>Серверы с инструментами: {mentions.filter((m) => m.kind === "server").map((m) => m.name).join(", ") || "—"}</span>
          <span>Карточки в ответе: {mentions.filter((m) => m.kind !== "server").map((m) => m.name).join(", ") || "—"}</span>
        </div>
      </div>
    </div>
  );
};

const MemoryMentionPage = () => (
  <ProtoProvider defaults={{}}>
    <Picker
      params={<Params rows={[]} />}
      variants={[
        { Component: () => <Composer split={false} />, name: "Одно меню", pickerTop: true },
        { Component: () => <Composer split />, name: "Отдельный знак", pickerTop: true },
      ]}
    />
  </ProtoProvider>
);

export default MemoryMentionPage;
