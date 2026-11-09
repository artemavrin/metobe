"use client";

import { Button } from "@metobe/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@metobe/ui/components/dropdown-menu";
import { Input } from "@metobe/ui/components/input";
import { cn } from "@metobe/ui/lib/utils";
import {
  ArrowUp,
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  CircleHelp,
  Ellipsis,
  FolderKanban,
  ListChecks,
  Pencil,
  Quote,
  Search,
  Trash2,
  Undo2,
} from "lucide-react";
import { useState } from "react";

import { COMMITMENTS, DRAFTS, ENTITIES, EVENTS, FACTS, RULES, entity } from "./data";
import type { Commitment, Draft, Entity, Source } from "./data";
import { ENTER, PRESS, Shell, rise, usePhone, useProto } from "./frame";

// P16 · страница «Память» (D39) и строка «Запомнено» под ответом. Память пишется сама из чатов; здесь её смотрят,
// правят и удаляют. У каждой записи — откуда она (чат, слова, день); у события — когда произошло и, если позже, когда
// занесено. Неуверенные записи не пишутся, а ждут ответа — «Не записано».
// «Карточки» — список людей, организаций и проектов слева, карточка справа: обязательства, что известно, события.
// «Лента» — все записи по времени, с фильтром по типу и поиском.
// «В чате» — что видно под ответом: «Запомнено: …» с отменой, «Не записано: какой Андрей?» с выбором.
// Параметры: «не записано» — есть или нет; память — есть или пустая. В адресе: `?v=1&drafts=on&mem=empty&sz=phone`.

const KIND_LABEL: Record<Entity["kind"], string> = { org: "Организации", person: "Люди", project: "Проекты" };

const nameOf = (id: string) => (id === "me" ? "вы" : entity(id).name);

/** Кто кому обещал — без рода: «Обещано вам», «Вы обещали», «Обещано: Игорь Белов». `of` — карточка, с чьей стороны. */
const direction = (c: Commitment, of?: string) => {
  if (!of) {
    if (c.creditor === "me") return `${nameOf(c.debtor)} · обещано вам`;
    if (c.debtor === "me") return `Вы · обещано: ${nameOf(c.creditor)}`;
    return `${nameOf(c.debtor)} · обещано: ${nameOf(c.creditor)}`;
  }
  if (c.creditor === "me") return "Обещано вам";
  if (c.debtor === "me") return "Вы обещали";
  return of === c.debtor ? `Обещано: ${nameOf(c.creditor)}` : `От: ${nameOf(c.debtor)}`;
};

const Avatar = ({ e, size = "size-8" }: { e: Entity; size?: string }) => {
  const initials = e.name.replace(/[«»]/g, "").split(" ").map((w) => w[0]).slice(0, 2).join("");
  return (
    <span aria-hidden className={cn("bg-muted text-muted-foreground flex shrink-0 items-center justify-center rounded-full text-[11px] font-medium", size)}>
      {e.kind === "org" ? <Building2 className="size-3.5" /> : e.kind === "project" ? <FolderKanban className="size-3.5" /> : initials}
    </span>
  );
};

const SourceLine = ({ s, on }: { s: Source; on?: string }) => (
  <p className={cn("text-muted-foreground flex gap-2 text-xs leading-5", ENTER)}>
    <Quote className="mt-1 size-3 shrink-0" />
    <span>
      «{s.said}» — чат «{s.chat}», {s.recorded}
      {on && on !== s.recorded && <> (произошло {on})</>}
    </span>
  </p>
);

/** Скрытые и изменённые записи — общие для всех вариантов, с «Вернуть». */
const useEdits = () => {
  const { say } = useProto();
  const [gone, setGone] = useState<string[]>([]);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string[]>([]);
  return {
    done: (id: string) => {
      setDone((d) => [...d, id]);
      say("Отмечено выполненным", () => setDone((d) => d.filter((x) => x !== id)));
    },
    isDone: (c: Commitment) => c.status === "done" || done.includes(c.id),
    remove: (id: string) => {
      setGone((g) => [...g, id]);
      say("Удалено из памяти", () => setGone((g) => g.filter((x) => x !== id)));
    },
    rename: (id: string, text: string) => {
      setTexts((t) => ({ ...t, [id]: text }));
      say("Сохранено");
    },
    shown: (id: string) => !gone.includes(id),
    text: (id: string, fallback: string) => texts[id] ?? fallback,
  };
};
type Edits = ReturnType<typeof useEdits>;

/**
 * Запись: текст, подпись справа (дата), под ней — откуда. Меню: «Откуда», «Изменить» (поле на месте), «Удалить».
 * `lead` — что перед текстом (направление обязательства), `extra` — кнопка справа («Выполнено»).
 */
const Record = ({ id, text, meta, source, on, edits, lead, extra, muted, n }: {
  id: string; text: string; meta?: string; source: Source; on?: string; edits: Edits;
  lead?: React.ReactNode; extra?: React.ReactNode; muted?: boolean; n: number;
}) => {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const value = edits.text(id, text);
  if (!edits.shown(id)) return null;
  return (
    <li className={cn("group flex flex-col gap-1.5 rounded-lg px-2 py-2 hover:bg-muted/40", ENTER)} style={rise(n)}>
      <div className="flex items-start gap-2">
        {editing ? (
          <form
            className="flex flex-1 items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim()) edits.rename(id, draft.trim());
              setEditing(false);
            }}
          >
            {/* biome-ignore lint/a11y/noAutofocus: the field replaces the text the person chose to edit. */}
            <Input aria-label="Текст записи" autoFocus className="h-8" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setEditing(false)} value={draft} />
            <Button size="sm" type="submit">Сохранить</Button>
            <Button onClick={() => setEditing(false)} size="sm" type="button" variant="ghost">Отмена</Button>
          </form>
        ) : (
          <button className="flex min-w-0 flex-1 flex-col text-left" onClick={() => setOpen((o) => !o)} type="button">
            {lead && <span className="text-muted-foreground text-xs">{lead}</span>}
            <span className={cn("text-sm", muted && "text-muted-foreground line-through decoration-muted-foreground/40")}>{value}</span>
          </button>
        )}
        {!editing && meta && <span className="text-muted-foreground shrink-0 pt-0.5 text-xs tabular-nums">{meta}</span>}
        {!editing && extra}
        {!editing && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button aria-label="Ещё" className="opacity-60 group-hover:opacity-100" size="icon-xs" variant="ghost" />}>
              <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => setOpen((o) => !o)}>
                <Quote /> Откуда
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setDraft(value);
                  setEditing(true);
                }}
              >
                <Pencil /> Изменить
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => edits.remove(id)} variant="destructive">
                <Trash2 /> Удалить
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {open && !editing && <SourceLine on={on} s={source} />}
    </li>
  );
};

const Section = ({ title, children, count }: { title: string; children: React.ReactNode; count?: number }) => (
  <section className="flex flex-col gap-1">
    <h3 className="text-muted-foreground flex items-center gap-1.5 px-2 text-xs font-medium">
      {title}
      {count !== undefined && <span className="tabular-nums">{count}</span>}
    </h3>
    <ul className="flex flex-col">{children}</ul>
  </section>
);

/** «Раньше» и «Выполнено» — свёрнуты: история есть, но не мешает. */
const Folded = ({ title, children }: { title: string; children: React.ReactNode }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col">
      <button aria-expanded={open} className="text-muted-foreground hover:text-foreground flex items-center gap-1 self-start px-2 py-1 text-xs transition-colors duration-150" onClick={() => setOpen((o) => !o)} type="button">
        <ChevronDown className={cn("size-3.5 transition-transform duration-200", open ? "" : "-rotate-90")} />
        {title}
      </button>
      {open && <ul className="flex flex-col">{children}</ul>}
    </div>
  );
};

// ── Не записано ──────────────────────────────────────────────────────────────────────────────────────────────────────

const useDrafts = () => {
  const { knobs, say } = useProto();
  const [answered, setAnswered] = useState<string[]>([]);
  const list = knobs.drafts === "off" ? [] : DRAFTS.filter((d) => !answered.includes(d.id));
  const answer = (d: Draft, label: string | null) => {
    setAnswered((a) => [...a, d.id]);
    say(label ? `Записано: ${label}` : "Не записано", () => setAnswered((a) => a.filter((x) => x !== d.id)));
  };
  return { answer, list };
};

const DraftCard = ({ d, answer, n }: { d: Draft; answer: (d: Draft, label: string | null) => void; n: number }) => (
  <div className={cn("bg-card flex flex-col gap-2.5 rounded-xl border p-3", ENTER)} style={rise(n)}>
    <p className="text-sm">
      <span className="text-muted-foreground">«{d.said}»</span> — {d.question}
    </p>
    <div className="flex flex-wrap gap-1.5">
      {d.options.map((o) => (
        <Button className={PRESS} key={o.id} onClick={() => answer(d, `${d.said} — ${o.label}`)} size="sm" variant="outline">
          {o.label}
        </Button>
      ))}
      <Button className={PRESS} onClick={() => answer(d, null)} size="sm" variant="ghost">
        Не записывать
      </Button>
    </div>
    <span className="text-muted-foreground text-xs">Чат «{d.chat}»</span>
  </div>
);

// ── Пусто ────────────────────────────────────────────────────────────────────────────────────────────────────────────

const Empty = () => (
  <div className={cn("mx-auto flex max-w-md flex-col gap-2 px-6 py-16 text-center", ENTER)}>
    <p className="text-sm font-medium">Память пуста</p>
    <p className="text-muted-foreground text-sm leading-6">
      Сюда попадают люди, организации, проекты, обещания и события из ваших чатов. Например: «Андрей обещал смету к
      пятнице» — запишется обязательство Андрея со сроком.
    </p>
  </div>
);

// ── Карточки ─────────────────────────────────────────────────────────────────────────────────────────────────────────

type Pick = { type: "entity"; id: string } | { type: "drafts" } | { type: "rules" };

const openFor = (id: string, edits: Edits) =>
  COMMITMENTS.filter((c) => (c.debtor === id || c.creditor === id) && !edits.isDone(c) && edits.shown(c.id)).length;

const EntityCard = ({ e, edits, onBack }: { e: Entity; edits: Edits; onBack?: () => void }) => {
  const mine = COMMITMENTS.filter((c) => c.debtor === e.id || c.creditor === e.id);
  const open = mine.filter((c) => !edits.isDone(c));
  const closed = mine.filter((c) => edits.isDone(c));
  const facts = FACTS.filter((f) => f.about === e.id);
  const now = facts.filter((f) => !f.until);
  const before = facts.filter((f) => f.until);
  const events = EVENTS.filter((v) => v.who.includes(e.id));
  let n = 0;
  return (
    <div className={cn("flex flex-col gap-6", ENTER)} key={e.id}>
      <header className="flex items-center gap-3">
        {onBack && (
          <Button aria-label="Назад" onClick={onBack} size="icon-sm" variant="ghost">
            <ChevronLeft />
          </Button>
        )}
        <Avatar e={e} size="size-10" />
        <div className="flex min-w-0 flex-col">
          <h2 className="text-lg font-semibold tracking-tight">{e.name}</h2>
          <span className="text-muted-foreground text-sm">{e.role}</span>
        </div>
      </header>
      {open.length > 0 && (
        <Section count={open.length} title="Обязательства">
          {open.map((c) => (
            <Record
              edits={edits}
              extra={
                <Button aria-label="Выполнено" className={cn("opacity-60 group-hover:opacity-100", PRESS)} onClick={() => edits.done(c.id)} size="icon-xs" variant="ghost">
                  <Check />
                </Button>
              }
              id={c.id}
              key={c.id}
              lead={direction(c, e.id)}
              meta={c.due ? `до ${c.due}` : `с ${c.given}`}
              n={n++}
              source={c.source}
              text={c.what}
            />
          ))}
        </Section>
      )}
      {(now.length > 0 || before.length > 0) && (
        <Section title="Известно">
          {now.map((f) => (
            <Record edits={edits} id={f.id} key={f.id} meta={f.since && `с ${f.since}`} n={n++} source={f.source} text={f.text} />
          ))}
          {before.length > 0 && (
            <Folded title="Раньше">
              {before.map((f) => (
                <Record edits={edits} id={f.id} key={f.id} meta={`до ${f.until}`} muted n={n++} source={f.source} text={f.text} />
              ))}
            </Folded>
          )}
        </Section>
      )}
      {events.length > 0 && (
        <Section title="События">
          {events.map((v) => (
            <Record edits={edits} id={v.id} key={v.id} meta={v.on} n={n++} on={v.on} source={v.source} text={v.text} />
          ))}
        </Section>
      )}
      {closed.length > 0 && (
        <Folded title={`Выполнено · ${closed.length}`}>
          {closed.map((c) => (
            <Record edits={edits} id={c.id} key={c.id} lead={direction(c, e.id)} muted n={n++} source={c.source} text={c.what} />
          ))}
        </Folded>
      )}
    </div>
  );
};

const RulesCard = ({ edits, onBack }: { edits: Edits; onBack?: () => void }) => (
  <div className={cn("flex flex-col gap-4", ENTER)}>
    <header className="flex items-center gap-3">
      {onBack && (
        <Button aria-label="Назад" onClick={onBack} size="icon-sm" variant="ghost">
          <ChevronLeft />
        </Button>
      )}
      <div className="flex flex-col">
        <h2 className="text-lg font-semibold tracking-tight">Правила</h2>
        <span className="text-muted-foreground text-sm">По ним собирается план на день. Новое правило — словами в любом чате.</span>
      </div>
    </header>
    <ul className="flex flex-col">
      {RULES.map((r, i) => (
        <Record edits={edits} id={r.id} key={r.id} n={i} source={r.source} text={r.text} />
      ))}
    </ul>
  </div>
);

const DraftsCard = ({ drafts, onBack }: { drafts: ReturnType<typeof useDrafts>; onBack?: () => void }) => (
  <div className={cn("flex flex-col gap-4", ENTER)}>
    <header className="flex items-center gap-3">
      {onBack && (
        <Button aria-label="Назад" onClick={onBack} size="icon-sm" variant="ghost">
          <ChevronLeft />
        </Button>
      )}
      <div className="flex flex-col">
        <h2 className="text-lg font-semibold tracking-tight">Не записано</h2>
        <span className="text-muted-foreground text-sm">Непонятно, о ком речь. Пока нет ответа, этого нет в памяти и в плане.</span>
      </div>
    </header>
    {drafts.list.length ? (
      drafts.list.map((d, i) => <DraftCard answer={drafts.answer} d={d} key={d.id} n={i} />)
    ) : (
      <p className="text-muted-foreground text-sm">Всё разобрано.</p>
    )}
  </div>
);

export const Cards = () => {
  const { knobs } = useProto();
  const phone = usePhone();
  const edits = useEdits();
  const drafts = useDrafts();
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<Pick | null>(phone ? null : { id: "olga", type: "entity" });
  if (knobs.mem === "empty") {
    return (
      <Shell area="memory" title="Память">
        <Empty />
      </Shell>
    );
  }
  const found = ENTITIES.filter((e) => `${e.name} ${e.role}`.toLowerCase().includes(q.trim().toLowerCase()));
  const isPicked = (p: Pick) => JSON.stringify(p) === JSON.stringify(pick);
  const item = (p: Pick, children: React.ReactNode, key: string) => (
    <button
      aria-current={isPicked(p) ? "true" : undefined}
      className={cn("flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-150", isPicked(p) ? "bg-muted" : "hover:bg-muted/50")}
      key={key}
      onClick={() => setPick(p)}
      type="button"
    >
      {children}
    </button>
  );
  const list = (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input aria-label="Найти в памяти" className="pl-8" onChange={(e) => setQ(e.target.value)} placeholder="Найти" value={q} />
      </div>
      {!q && drafts.list.length > 0 &&
        item(
          { type: "drafts" },
          <>
            <CircleHelp className="text-warning size-4 shrink-0" />
            <span className="flex-1 text-sm font-medium">Не записано</span>
            <span className="text-muted-foreground text-xs tabular-nums">{drafts.list.length}</span>
          </>,
          "drafts"
        )}
      {(["person", "org", "project"] as const).map((kind) => {
        const of = found.filter((e) => e.kind === kind);
        if (!of.length) return null;
        return (
          <div className="flex flex-col gap-0.5" key={kind}>
            <span className="text-muted-foreground px-2 pb-1 text-xs">{KIND_LABEL[kind]}</span>
            {of.map((e) => {
              const count = openFor(e.id, edits);
              return item(
                { id: e.id, type: "entity" },
                <>
                  <Avatar e={e} size="size-7" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm">{e.name}</span>
                    <span className="text-muted-foreground truncate text-xs">{e.role}</span>
                  </span>
                  {count > 0 && <span className="text-muted-foreground text-xs tabular-nums" title="Открытых обязательств">{count}</span>}
                </>,
                e.id
              );
            })}
          </div>
        );
      })}
      {!q &&
        item(
          { type: "rules" },
          <>
            <ListChecks className="text-muted-foreground size-4 shrink-0" />
            <span className="flex-1 text-sm">Правила</span>
            <span className="text-muted-foreground text-xs tabular-nums">{RULES.length}</span>
          </>,
          "rules"
        )}
      {found.length === 0 && <p className="text-muted-foreground px-2 text-sm">Ничего не нашлось.</p>}
    </div>
  );
  const back = phone ? () => setPick(null) : undefined;
  const detail =
    pick?.type === "entity" ? <EntityCard e={entity(pick.id)} edits={edits} key={pick.id} onBack={back} /> :
    pick?.type === "rules" ? <RulesCard edits={edits} onBack={back} /> :
    pick?.type === "drafts" ? <DraftsCard drafts={drafts} onBack={back} /> : null;
  if (phone) {
    return (
      <Shell area="memory" title="Память">
        <div className="p-4">{detail ?? list}</div>
      </Shell>
    );
  }
  return (
    <Shell area="memory" title="Память">
      <div className="flex min-h-0 flex-1">
        <div className="w-72 shrink-0 overflow-y-auto border-r p-3">{list}</div>
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-6 pt-20 pb-8">{detail}</div>
        </div>
      </div>
    </Shell>
  );
};

// ── Лента ────────────────────────────────────────────────────────────────────────────────────────────────────────────

const MONTHS = ["янв", "фев", "мар", "апр", "ма", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
/** «28 окт», «декабря», «2025» → число для сортировки (год·10000 + месяц·100 + день). */
const dayKey = (s?: string) => {
  if (!s) return 0;
  if (/^\d{4}$/.test(s)) return Number(s) * 10000;
  const m = MONTHS.findIndex((x) => s.replace(/^\d+\s*/, "").startsWith(x));
  const d = Number.parseInt(s, 10);
  return 2026 * 10000 + (m + 1) * 100 + (Number.isNaN(d) ? 0 : d);
};

type Kind = "all" | "commitment" | "fact" | "event" | "rule";
const KINDS: [Kind, string][] = [["all", "Все"], ["commitment", "Обязательства"], ["fact", "Известно"], ["event", "События"], ["rule", "Правила"]];

interface Line { id: string; kind: Exclude<Kind, "all">; who: string[]; text: string; lead?: string; date: string; key: number; on?: string; source: Source; muted?: boolean }

const lines = (edits: Edits): Line[] => [
  ...COMMITMENTS.map((c): Line => ({ date: c.due ? `до ${c.due}` : c.given, id: c.id, key: dayKey(c.given), kind: "commitment", lead: direction(c), muted: edits.isDone(c), source: c.source, text: c.what, who: [c.debtor, c.creditor].filter((x) => x !== "me") })),
  ...FACTS.map((f): Line => ({ date: f.until ? `до ${f.until}` : f.since ? `с ${f.since}` : f.source.recorded, id: f.id, key: dayKey(f.source.recorded), kind: "fact", muted: !!f.until, source: f.source, text: f.text, who: [f.about] })),
  ...EVENTS.map((v): Line => ({ date: v.on, id: v.id, key: dayKey(v.on), kind: "event", on: v.on, source: v.source, text: v.text, who: v.who })),
  ...RULES.map((r): Line => ({ date: r.source.recorded, id: r.id, key: dayKey(r.source.recorded), kind: "rule", source: r.source, text: r.text, who: [] })),
];

const period = (key: number) => (key >= 20261102 ? "Эта и прошлая неделя" : key >= 20261001 ? "Октябрь" : "Раньше");

export const Feed = () => {
  const { knobs } = useProto();
  const edits = useEdits();
  const drafts = useDrafts();
  const [kind, setKind] = useState<Kind>("all");
  const [q, setQ] = useState("");
  if (knobs.mem === "empty") {
    return (
      <Shell area="memory" title="Память">
        <Empty />
      </Shell>
    );
  }
  const needle = q.trim().toLowerCase();
  const shown = lines(edits)
    .filter((l) => (kind === "all" || l.kind === kind) && edits.shown(l.id))
    .filter((l) => !needle || `${l.text} ${l.lead ?? ""} ${l.who.map((w) => entity(w).name).join(" ")}`.toLowerCase().includes(needle))
    .sort((a, b) => b.key - a.key);
  const groups = [...new Set(shown.map((l) => period(l.key)))];
  let n = 0;
  return (
    <Shell area="memory" title="Память">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pt-20 pb-8 @max-md:py-4">
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input aria-label="Найти в памяти" className="pl-8" onChange={(e) => setQ(e.target.value)} placeholder="Найти: человек, организация, слово" value={q} />
          </div>
          <div className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
            {KINDS.map(([k, label]) => (
              <button
                aria-pressed={kind === k}
                className={cn("shrink-0 rounded-full border px-3 py-1 text-xs transition-colors duration-150", kind === k ? "bg-foreground text-background border-transparent" : "hover:bg-muted")}
                key={k}
                onClick={() => setKind(k)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {kind === "all" && !needle && drafts.list.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-muted-foreground px-2 text-xs font-medium">Не записано · {drafts.list.length}</h3>
            {drafts.list.map((d, i) => (
              <DraftCard answer={drafts.answer} d={d} key={d.id} n={i} />
            ))}
          </section>
        )}
        {groups.map((g) => (
          <Section key={g} title={g}>
            {shown
              .filter((l) => period(l.key) === g)
              .map((l) => (
                <Record
                  edits={edits}
                  id={l.id}
                  key={l.id}
                  lead={l.kind === "commitment" ? l.lead : l.who.map((w) => entity(w).name).join(", ") || undefined}
                  meta={l.date}
                  muted={l.muted}
                  n={n++}
                  on={l.on}
                  source={l.source}
                  text={l.text}
                />
              ))}
          </Section>
        ))}
        {shown.length === 0 && <p className="text-muted-foreground px-2 text-sm">Ничего не нашлось.</p>}
      </div>
    </Shell>
  );
};

// ── В чате ───────────────────────────────────────────────────────────────────────────────────────────────────────────

const User = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-muted max-w-[80%] self-end rounded-2xl px-4 py-2 text-sm leading-6">{children}</div>
);

const Assistant = ({ children }: { children: React.ReactNode }) => <div className="text-sm leading-6">{children}</div>;

/** Строка под ответом: что записано, с отменой; раскрывается в список, каждую запись можно убрать отдельно. */
const Remembered = ({ items }: { items: string[] }) => {
  const { say } = useProto();
  const [left, setLeft] = useState(items);
  const [open, setOpen] = useState(false);
  if (!left.length) return null;
  return (
    <div className={cn("text-muted-foreground flex flex-col gap-1 text-xs", ENTER)}>
      <div className="flex items-center gap-2">
        <button aria-expanded={open} className="hover:text-foreground flex min-w-0 items-center gap-1.5 text-left transition-colors duration-150" onClick={() => setOpen((o) => !o)} type="button">
          <ChevronDown className={cn("size-3.5 shrink-0 transition-transform duration-200", open ? "" : "-rotate-90")} />
          <span className="truncate">
            Запомнено: {left.length === 1 ? left[0] : `${left.length} записи`}
          </span>
        </button>
        <button
          className={cn("hover:text-foreground flex shrink-0 items-center gap-1 transition-colors duration-150", PRESS)}
          onClick={() => {
            const before = left;
            setLeft([]);
            say("Удалено из памяти", () => setLeft(before));
          }}
          type="button"
        >
          <Undo2 className="size-3" /> Отменить
        </button>
      </div>
      {open && (
        <ul className="flex flex-col gap-0.5 pl-5">
          {left.map((t) => (
            <li className="group flex items-center gap-2" key={t}>
              <span>{t}</span>
              <button
                aria-label={`Удалить: ${t}`}
                className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100 hover:text-foreground"
                onClick={() => setLeft((l) => l.filter((x) => x !== t))}
                type="button"
              >
                <Trash2 className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/** Не записано: выбор прямо под ответом; после выбора строка становится «Запомнено». */
const Unsure = () => {
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  if (chosen === null) return <p className={cn("text-muted-foreground text-xs", ENTER)}>Не записано</p>;
  if (chosen) return <Remembered items={[`${chosen} — отпуск 10 ноября`]} />;
  return (
    <div className={cn("text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs", ENTER)}>
      <CircleHelp className="text-warning size-3.5" />
      <span>Не записано: какой Андрей?</span>
      {["Андрей Смирнов", "Андрей Ковалёв"].map((a) => (
        <button className={cn("hover:bg-muted rounded-full border px-2 py-0.5 transition-colors duration-150", PRESS)} key={a} onClick={() => setChosen(a)} type="button">
          {a}
        </button>
      ))}
      <button className="hover:text-foreground px-1 transition-colors duration-150" onClick={() => setChosen(null)} type="button">
        Не записывать
      </button>
    </div>
  );
};

export const InChat = () => (
  <Shell area="chat" title="Договор с перевозчиком">
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 pt-20 pb-8 @max-md:pt-4">
      <User>Созвонился с Ольгой: подписанный договор пришлют до пятницы. И «Вектор» так и не ответил на предложение.</User>
      <div className="flex flex-col gap-2">
        <Assistant>
          <p>
            Ольга Ли обещала договор ещё 28 октября, теперь срок — пятница, 13 ноября. ООО «Вектор» не отвечает на
            коммерческое предложение с 3 ноября — 6 дней. Подготовить им короткое напоминание?
          </p>
        </Assistant>
        <Remembered items={["созвон с Ольгой Ли, 9 ноября", "Ольга Ли — подписанный договор до 13 ноября"]} />
      </div>
      <User>Андрей завтра в отпуске, перенеси нашу встречу на четверг.</User>
      <div className="flex flex-col gap-2">
        <Assistant>
          <p>Встречу перенесу на четверг, 12 ноября. Пригласить тех же участников?</p>
        </Assistant>
        <Unsure />
      </div>
    </div>
    <div className="bg-background sticky bottom-0 mx-auto w-full max-w-2xl px-4 pt-2 pb-4">
      <div className="flex items-end gap-1 rounded-3xl border p-1.5 pl-4 shadow-xs">
        <span className="text-muted-foreground flex-1 py-1.5 text-sm">Сообщение</span>
        <Button aria-label="Отправить" className="rounded-full" disabled size="icon">
          <ArrowUp />
        </Button>
      </div>
    </div>
  </Shell>
);
