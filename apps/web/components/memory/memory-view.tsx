"use client";

import type {
  ChatMemory,
  MemoryCard,
  MemoryCardItem,
  MemoryEntityKind,
  MemoryMergeSuggestion,
  MemoryRecordView,
} from "@metobe/contracts/memory";
import { Button } from "@metobe/ui/components/button";
import { Toaster } from "@metobe/ui/components/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import {
  ChevronDown,
  LoaderCircle,
  Mail,
  MailCheck,
  Pencil,
  Phone,
  Plus,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { TopBar } from "@/components/chat/top-bar";
import { cardMarker } from "@/lib/mentions";

import {
  Avatar,
  Balance,
  MeetingButton,
  Now,
  Reliability,
  Section,
  byUrgency,
  sidesOf,
} from "./card-parts";
import { DueView } from "./due-view";
import { Header } from "./memory-header";
import { MemoryRows, NewCardDialog, NewRuleDialog } from "./memory-list";
import {
  ENTER,
  FreshContext,
  MemoryActionsContext,
  MemoryRecordRow,
  PRESS,
  occurredWords,
  useActions,
  shortDay,
  useDirection,
} from "./memory-record";
import { useMemoryStore } from "./memory-store";
import { CardMenu } from "./merge-dialog";
import { RemindersView } from "./reminders-view";
import type { T } from "./use-memory-actions";

// The «Память» page (P16 «Карточки», D39): people, organizations and projects on the left with their open and overdue
// commitments, «Не записано» and «Правила»; the card on the right — commitments (important first, then by deadline),
// what is known with «Раньше», events, the closed ones folded. On a phone — the list, then the card.

type Question = ChatMemory["questions"][number];

const OPEN = new Set(["open", "unconfirmed"]);

/** «Раньше» and the closed ones: the history is there, folded out of the way. */
const Folded = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col">
      <button
        aria-expanded={open}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1 self-start px-2 py-1 text-xs transition-colors duration-150"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <ChevronDown
          className={cn(
            "size-3.5 transition-transform duration-200",
            !open && "-rotate-90"
          )}
        />
        {title}
      </button>
      {open && <ul className="flex flex-col">{children}</ul>}
    </div>
  );
};

/** «Сверка»: a new chat with the request in its composer — every open agreement with them, for the chat's model to write. */
const checkLink = (card: MemoryCardItem, records: MemoryRecordView[], t: T) => {
  const items = records
    .filter((r) => r.kind === "commitment" && OPEN.has(r.status ?? ""))
    // oxlint-disable-next-line unicorn/no-array-sort -- sorts the filter's own copy
    .sort(byUrgency)
    .map((r) => `— ${r.text}`)
    .join("\n");
  return `/?say=${encodeURIComponent(t("checkAsk", { items, name: cardMarker(card) }))}`;
};

/** The role under the name, changed in place (P22): pressed — a field; Enter or leaving it saves, Escape does not. */
const Role = ({ card }: { card: MemoryCardItem }) => {
  // A thing of the person's own kind says what it is (its type); the others — who they are.
  const field = card.kind === "custom" ? "type" : "role";
  const t = useTranslations("memory");
  const { patchCard } = useActions();
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState(card[field] ?? "");
  const save = async () => {
    setEditing(false);
    const next = role.trim();
    if (next !== (card[field] ?? "")) {
      await patchCard(card.id, { [field]: next || null });
    }
  };
  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <input
          aria-label={t(`${field}Label`)}
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- opened by the person's press
          autoFocus
          className="border-foreground/30 w-56 max-w-full border-b bg-transparent text-sm outline-none"
          maxLength={500}
          onBlur={save}
          onChange={(e) => setRole(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setRole(card[field] ?? "");
              setEditing(false);
            }
          }}
          placeholder={t(`${field}Ask`)}
          value={role}
        />
      </form>
    );
  }
  return (
    // Pressed — a field; the hover colour says it can be changed, nothing stands between the role and the dot.
    <button
      className="text-muted-foreground hover:text-foreground group/role relative max-w-[60%] shrink-0 truncate text-start text-sm transition-colors duration-150"
      onClick={() => setEditing(true)}
      title={t("roleEdit")}
      type="button"
    >
      {card[field] || t(`${field}Ask`)}
    </button>
  );
};

/** Under the role: the groups they are in and the projects their records name, each a way to its card. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const PHONE = /^[+\d][\d\s().-]{3,29}$/u;

/**
 * One way to reach them, changed in place: set — a link (`mailto:`, `tel:`) with a pencil on hover; not set — a quiet
 * «Добавить …». Enter or leaving the field saves, Escape does not; what is not an address or a number is not saved.
 */
const Reach = ({
  card,
  field,
}: {
  card: MemoryCardItem;
  field: "email" | "phone";
}) => {
  const t = useTranslations("memory");
  const { patchCard } = useActions();
  const [editing, setEditing] = useState(false);
  const value = card[field];
  const [text, setText] = useState(value ?? "");
  const Icon = field === "email" ? Mail : Phone;
  const valid = (v: string) => (field === "email" ? EMAIL : PHONE).test(v);
  const save = async () => {
    const next = text.trim();
    if (next && !valid(next)) {
      return;
    }
    setEditing(false);
    if (next !== (value ?? "")) {
      await patchCard(card.id, { [field]: next || null });
    }
  };
  if (editing) {
    const bad = text.trim() !== "" && !valid(text.trim());
    return (
      <form
        className="flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Icon className="text-muted-foreground size-3.5 shrink-0" />
        <input
          aria-invalid={bad}
          aria-label={t(`${field}Label`)}
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- opened by the person's press
          autoFocus
          className={cn(
            "w-52 border-b bg-transparent text-sm outline-none",
            bad ? "border-destructive" : "border-foreground/30"
          )}
          maxLength={200}
          onBlur={() => (bad ? setEditing(false) : save())}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setText(value ?? "");
              setEditing(false);
            }
          }}
          type={field === "email" ? "email" : "tel"}
          value={text}
        />
      </form>
    );
  }
  if (!value) {
    return (
      <button
        className="text-muted-foreground/70 hover:text-foreground flex items-center gap-1.5 text-sm transition-colors duration-150"
        onClick={() => {
          setText("");
          setEditing(true);
        }}
        type="button"
      >
        <Icon className="size-3.5 shrink-0" />
        {t(`${field}Add`)}
      </button>
    );
  }
  return (
    <span className="group/reach flex items-center gap-1.5 text-sm">
      <Icon className="text-muted-foreground size-3.5 shrink-0" />
      <a
        className="hover:underline"
        href={
          field === "email"
            ? `mailto:${value}`
            : `tel:${value.replaceAll(/[\s().-]/gu, "")}`
        }
      >
        {value}
      </a>
      <button
        aria-label={t(`${field}Label`)}
        className="text-muted-foreground hover:text-foreground opacity-0 transition-opacity duration-150 group-hover/reach:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-60"
        onClick={() => {
          setText(value);
          setEditing(true);
        }}
        type="button"
      >
        <Pencil className="size-3" />
      </button>
    </span>
  );
};

/** Under the figures of a person or an organization: how to reach them. */
const Contacts = ({ card }: { card: MemoryCardItem }) => (
  <div className="-mt-2 flex flex-wrap gap-x-6 gap-y-1 px-2">
    <Reach card={card} field="email" key={`e${card.email}`} />
    <Reach card={card} field="phone" key={`p${card.phone}`} />
  </div>
);

/** After the role, on its line: the groups they are in and the projects their records name, each a way to its card. */
const Links = ({ links }: { links: NonNullable<MemoryCard["links"]> }) =>
  links.map((l) => (
    <span className="text-muted-foreground/70" key={l.id}>
      <span aria-hidden>· </span>
      <Link
        className="hover:text-foreground transition-colors duration-150"
        href={`/memory?card=${l.id}`}
      >
        {l.name}
      </Link>
    </span>
  ));

/** Under the name: a person's or an organization's role (changed in place), then their groups and projects; others — the role. */
const Hint = ({ data }: { data: MemoryCard }) =>
  data.contact || data.card.kind === "custom" ? (
    <div className="flex min-w-0 items-baseline gap-x-1.5 text-sm">
      <Role card={data.card} key={`${data.card.role}${data.card.type}`} />
      <span className="min-w-0 flex-1 truncate">
        <Links links={data.links ?? []} />
      </span>
    </div>
  ) : (
    data.card.role
  );

const FIELDS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** Typing in another field, or a key with a modifier: «N» is not ours then. */
const typing = (e: KeyboardEvent) => {
  const target = e.target as HTMLElement | null;
  return (
    e.metaKey ||
    e.ctrlKey ||
    e.altKey ||
    Boolean(target?.isContentEditable) ||
    FIELDS.has(target?.tagName ?? "")
  );
};

/**
 * «Записать…» (P22): a quiet line — pressed, or «N» anywhere on the page, and it is a field; Enter hands the words to
 * the memory, which picks what they are and where they lie. What went in lights up where it lies. On a card they are
 * a note about it; on «Правила» — a rule.
 */
const NoteLine = ({
  label,
  placeholder,
  send,
  onWritten,
}: {
  label: string;
  placeholder: string;
  /** Hands the words over; the records they made — none when nothing went in. */
  send: (text: string) => Promise<MemoryRecordView[] | null>;
  onWritten: (ids: string[]) => void;
}) => {
  const t = useTranslations("memory");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  let hint = "N";
  if (busy) {
    hint = t("noteWriting");
  } else if (text) {
    hint = "Enter";
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "n" || typing(e)) {
        return;
      }
      e.preventDefault();
      field.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <form
      className="group/add focus-within:border-foreground/30 hover:bg-muted/40 flex items-center gap-2.5 rounded-lg border border-transparent px-2 py-1.5 transition-colors duration-150 focus-within:hover:bg-transparent"
      onSubmit={async (e) => {
        e.preventDefault();
        const said = text.trim();
        if (!said || busy) {
          return;
        }
        setBusy(true);
        const written = await send(said);
        setBusy(false);
        // Nothing found or a failure: the words stay, to say it otherwise.
        if (written) {
          setText("");
          onWritten(written.map((r) => r.id));
        }
      }}
    >
      <span className="text-muted-foreground flex size-6 shrink-0 items-center justify-center">
        {busy ? (
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
        ) : (
          <Plus className="size-4" />
        )}
      </span>
      <input
        aria-label={label}
        className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none disabled:opacity-60"
        disabled={busy}
        maxLength={2000}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        ref={field}
        value={text}
      />
      <kbd
        className={cn(
          "text-muted-foreground/70 rounded border px-1.5 text-[10px] leading-5 transition-opacity duration-150 @max-md:hidden",
          text ? "opacity-100" : "group-focus-within/add:opacity-0"
        )}
      >
        {hint}
      </kbd>
    </form>
  );
};

const CardView = ({
  data,
  onBack,
  timeZone,
}: {
  data: MemoryCard;
  onBack?: () => void;
  timeZone: string;
}) => {
  const t = useTranslations("memory");
  const format = useFormatter();
  const direction = useDirection();
  const { card, records } = data;
  const { note } = useActions();
  // What a note just wrote (P22): lit up where it went.
  const [fresh, setFresh] = useState<string[]>([]);
  const commitments = records.filter((r) => r.kind === "commitment");
  const open = commitments
    .filter((r) => OPEN.has(r.status ?? ""))
    // oxlint-disable-next-line unicorn/no-array-sort -- sorts the filter's own copy (toSorted is past the ES2022 target)
    .sort(byUrgency);
  const closed = commitments.filter((r) => !OPEN.has(r.status ?? ""));
  const { mine, others, split, theirs } = sidesOf(card, open);
  const known = records.filter(
    (r) => r.kind === "fact" || r.kind === "assessment"
  );
  const now = known.filter((r) => !r.validTo);
  const before = known.filter((r) => r.validTo);
  const allEvents = records.filter((r) => r.kind === "event");
  const events = allEvents.filter((r) => !r.supersededAt);
  // A later message took their place (a meeting moved): folded, like what was true before.
  const replaced = allEvents.filter((r) => r.supersededAt);
  const day = (iso: string | null) =>
    iso ? shortDay(iso, format, timeZone) : null;
  return (
    <FreshContext value={fresh}>
      <div className={cn("@container flex flex-col gap-6", ENTER)}>
        <Header
          action={
            <div className="flex items-center gap-1.5">
              <MeetingButton card={card} />
              {card.kind !== "project" &&
                card.kind !== "custom" &&
                open.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger
                      delay={400}
                      render={
                        <Button
                          className={PRESS}
                          nativeButton={false}
                          render={<Link href={checkLink(card, records, t)} />}
                          size="sm"
                          variant="outline"
                        />
                      }
                    >
                      <MailCheck />{" "}
                      <span className="max-sm:sr-only">{t("check")}</span>
                    </TooltipTrigger>
                    <TooltipContent
                      arrow={false}
                      className="bg-sidebar text-foreground ring-foreground/10 max-w-64 shadow-md ring-1"
                      sideOffset={6}
                    >
                      {t("checkHint")}
                    </TooltipContent>
                  </Tooltip>
                )}
              <CardMenu card={card} />
            </div>
          }
          avatar={<Avatar kind={card.kind} name={card.name} size="size-10" />}
          hint={<Hint data={data} />}
          onBack={onBack}
          title={card.name}
        />
        <Now data={data} timeZone={timeZone} />
        <Reliability data={data} />
        {data.contact && <Contacts card={card} />}
        <NoteLine
          label={t("noteLabel", { name: card.name })}
          onWritten={setFresh}
          placeholder={t("notePlaceholder")}
          send={(text) => note(card, text)}
        />
        {card.kind === "group" && (
          <Section count={data.members?.length ?? 0} title={t("members")}>
            {data.members?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {data.members.map((m) => (
                  <Link
                    className={cn(
                      "hover:bg-muted flex items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-0.5 text-sm transition-colors duration-150",
                      PRESS
                    )}
                    href={`/memory?card=${m.id}`}
                    key={m.id}
                  >
                    <Avatar
                      kind={m.kind === "self" ? "person" : m.kind}
                      name={m.name}
                      size="size-6"
                    />
                    {m.name}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">{t("noMembers")}</p>
            )}
          </Section>
        )}
        <Balance day={(iso) => day(iso) ?? ""} mine={mine} theirs={theirs} />
        {others.length > 0 && (
          <Section
            count={others.length}
            title={split ? t("otherPromises") : t("commitments")}
          >
            {others.map((r) => (
              <MemoryRecordRow
                key={r.id}
                lead={direction(r, card.id)}
                meta={t("givenOn", {
                  date: day(r.givenAt ?? r.recordedAt) ?? "",
                })}
                record={r}
              />
            ))}
          </Section>
        )}
        {/* Side by side only when there are both: one alone keeps the width. */}
        <div
          className={cn(
            "grid gap-x-10 gap-y-6 border-t pt-6 empty:hidden",
            now.length + before.length > 0 &&
              allEvents.length > 0 &&
              "@2xl:grid-cols-2"
          )}
        >
          {(now.length > 0 || before.length > 0) && (
            <Section title={t("known")}>
              {now.map((r) => (
                <MemoryRecordRow
                  key={r.id}
                  meta={
                    r.validFrom
                      ? t("since", { date: day(r.validFrom) ?? "" })
                      : day(r.recordedAt)
                  }
                  record={r}
                />
              ))}
              {before.length > 0 && (
                <Folded title={t("earlier")}>
                  {before.map((r) => (
                    <MemoryRecordRow
                      key={r.id}
                      meta={t("until", { date: day(r.validTo) ?? "" })}
                      muted
                      record={r}
                    />
                  ))}
                </Folded>
              )}
            </Section>
          )}
          {allEvents.length > 0 && (
            <Section title={t("events")}>
              {events.map((r) => (
                <MemoryRecordRow
                  dated
                  key={r.id}
                  meta={occurredWords(r, format, timeZone, t)}
                  record={r}
                />
              ))}
              {replaced.length > 0 && (
                <Folded title={t("earlier")}>
                  {replaced.map((r) => (
                    <MemoryRecordRow
                      key={r.id}
                      meta={occurredWords(r, format, timeZone, t)}
                      muted
                      record={r}
                    />
                  ))}
                </Folded>
              )}
            </Section>
          )}
        </div>
        {closed.length > 0 && (
          <Folded title={t("closed", { count: closed.length })}>
            {closed.map((r) => (
              <MemoryRecordRow
                key={r.id}
                lead={`${direction(r, card.id)} · ${t("status", { status: r.status ?? "done" })}`}
                meta={day(r.doneAt)}
                muted
                record={r}
              />
            ))}
          </Folded>
        )}
      </div>
    </FreshContext>
  );
};

const NEW_LABEL: Record<
  MemoryEntityKind,
  "newPerson" | "newOrg" | "newProject" | "newGroup" | "newOther"
> = {
  custom: "newOther",
  group: "newGroup",
  org: "newOrg",
  person: "newPerson",
  project: "newProject",
  self: "newPerson",
};

const Questions = ({
  questions,
  merges,
  answer,
  merge,
  dismissMerge,
  onBack,
}: {
  questions: Question[];
  merges: MemoryMergeSuggestion[];
  answer: (q: Question, body: object) => Promise<void>;
  merge: (gone: string, keep: { id: string; name: string }) => Promise<boolean>;
  dismissMerge: (a: string, b: string) => Promise<void>;
  onBack?: () => void;
}) => {
  const t = useTranslations("memory");
  const chat = useTranslations("chat.memory");
  return (
    <div className={cn("flex flex-col gap-4", ENTER)}>
      <Header
        hint={t("questionsHint")}
        onBack={onBack}
        title={t("questions")}
      />
      {questions.length === 0 && merges.length === 0 && (
        <p className="text-muted-foreground text-sm">{t("allSorted")}</p>
      )}
      {merges.map((m) => (
        <div
          className={cn(
            "bg-card flex flex-col gap-2.5 rounded-xl border p-3",
            ENTER
          )}
          key={`${m.keep.id}:${m.gone.id}`}
        >
          <p className="text-sm">
            {t("mergeAsk", { gone: m.gone.name, keep: m.keep.name })}
          </p>
          <p className="text-muted-foreground text-xs">
            {[m.keep, m.gone]
              .map((c) => (c.role ? `${c.name} — ${c.role}` : c.name))
              .join(" · ")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Button
              className={PRESS}
              onClick={() => merge(m.gone.id, m.keep)}
              size="sm"
              variant="outline"
            >
              {t("mergeAction")}
            </Button>
            <Button
              className={PRESS}
              onClick={() => dismissMerge(m.keep.id, m.gone.id)}
              size="sm"
              variant="ghost"
            >
              {t("mergeDifferent")}
            </Button>
          </div>
        </div>
      ))}
      {questions.map((q) => (
        <div
          className={cn(
            "bg-card flex flex-col gap-2.5 rounded-xl border p-3",
            ENTER
          )}
          key={q.id}
        >
          <p className="text-sm">{q.question}</p>
          <div className="flex flex-wrap gap-1.5">
            {q.candidates.map((c) => (
              <Button
                className={PRESS}
                key={c.id}
                onClick={() => answer(q, { entityId: c.id })}
                size="sm"
                title={c.role ?? undefined}
                variant="outline"
              >
                {c.name}
              </Button>
            ))}
            <Button
              className={PRESS}
              onClick={() => answer(q, { newCard: true })}
              size="sm"
              variant="outline"
            >
              {chat(NEW_LABEL[q.candidates[0]?.kind ?? "person"])}
            </Button>
            <Button
              className={PRESS}
              onClick={() => answer(q, { dismiss: true })}
              size="sm"
              variant="ghost"
            >
              {t("skip")}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};

/** «Обо мне»: what the person told about themselves — kept apart from the cards of others, shown like a card's «Известно». */
const Me = ({
  records,
  onBack,
  timeZone,
}: {
  records: MemoryRecordView[];
  onBack?: () => void;
  timeZone: string;
}) => {
  const t = useTranslations("memory");
  const format = useFormatter();
  const now = records.filter((r) => !r.validTo);
  const before = records.filter((r) => r.validTo);
  return (
    <div className={cn("flex flex-col gap-4", ENTER)}>
      <Header hint={t("meHint")} onBack={onBack} title={t("me")} />
      <ul className="flex flex-col">
        {now.map((r) => (
          <MemoryRecordRow
            key={r.id}
            meta={shortDay(r.validFrom ?? r.recordedAt, format, timeZone)}
            record={r}
          />
        ))}
      </ul>
      {before.length > 0 && (
        <Folded title={t("earlier")}>
          {before.map((r) => (
            <MemoryRecordRow
              key={r.id}
              meta={t("until", {
                date: shortDay(r.validTo ?? r.recordedAt, format, timeZone),
              })}
              muted
              record={r}
            />
          ))}
        </Folded>
      )}
    </div>
  );
};

const Rules = ({
  rules,
  onBack,
  send,
}: {
  rules: MemoryRecordView[];
  onBack?: () => void;
  /** A rule in words (`POST /api/memory/rules`). */
  send: (text: string) => Promise<MemoryRecordView[] | null>;
}) => {
  const t = useTranslations("memory");
  const [fresh, setFresh] = useState<string[]>([]);
  return (
    <FreshContext value={fresh}>
      <div className={cn("flex flex-col gap-4", ENTER)}>
        <Header hint={t("rulesHint")} onBack={onBack} title={t("rules")} />
        <NoteLine
          label={t("ruleLabel")}
          onWritten={setFresh}
          placeholder={t("ruleAsk")}
          send={send}
        />
        {rules.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noRules")}</p>
        ) : (
          <ul className="flex flex-col">
            {rules.map((r) => (
              <MemoryRecordRow key={r.id} record={r} />
            ))}
          </ul>
        )}
      </div>
    </FreshContext>
  );
};

const isClosed = (r: MemoryRecordView) =>
  r.kind === "commitment" && !OPEN.has(r.status ?? "");

/** Records found by text; the closed ones behind «Ещё N закрытых». */
const Found = ({ records }: { records: MemoryRecordView[] }) => {
  const t = useTranslations("memory");
  const direction = useDirection();
  const [all, setAll] = useState(false);
  const live = records.filter((r) => !isClosed(r));
  const closed = records.filter(isClosed);
  const shown = all ? records : live;
  if (records.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1">
      <Section count={records.length} title={t("records")}>
        {shown.map((r) => (
          <MemoryRecordRow
            key={r.id}
            lead={
              r.kind === "commitment"
                ? direction(r)
                : r.entities
                    .filter((e) => e.kind !== "self")
                    .map((e) => e.name)
                    .join(", ") || null
            }
            muted={isClosed(r)}
            record={r}
          />
        ))}
      </Section>
      {!all && closed.length > 0 && (
        <button
          className="text-muted-foreground hover:text-foreground self-start px-2 py-1 text-xs transition-colors duration-150"
          onClick={() => setAll(true)}
          type="button"
        >
          {t("moreClosed", { count: closed.length })}
        </button>
      )}
    </div>
  );
};

const Empty = ({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) => (
  <div
    className={cn(
      "mx-auto flex max-w-md flex-col gap-2 px-6 py-16 text-center",
      ENTER
    )}
  >
    <p className="text-sm font-medium">{title}</p>
    <p className="text-muted-foreground text-sm leading-6">{body}</p>
    {children}
  </div>
);

const Bar = () => {
  const t = useTranslations("memory");
  return (
    <TopBar>
      <h1 className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">
        {t("title")}
      </h1>
    </TopBar>
  );
};

/** The page's column: the calendar takes the whole of the place — its height and its width; the rest a readable column. */
const pageClass = (fill: boolean, phone: boolean) =>
  cn(
    "mx-auto flex flex-col gap-8",
    fill ? "h-full" : "max-w-3xl",
    phone ? "p-4" : "px-6 pt-8 pb-16",
    fill && !phone && "pb-6"
  );

/**
 * The page: what is picked in the list — a card, the calendar, «Обо мне», «Не записано», «Правила» — or what the search
 * found. The list stands in the app's sidebar (`MemoryListLevel`), and on a phone with nothing picked, here. Both read
 * the memory's store, so a change in one shows in the other.
 */
export const MemoryView = () => {
  const t = useTranslations("memory");
  const {
    actions,
    card,
    create,
    due,
    found,
    making,
    overview,
    phone,
    reread,
    ruleOpen,
    setDue,
    setMaking,
    setPick,
    setRuleOpen,
    shown,
    timeZone,
  } = useMemoryStore();

  // Not read yet: the sidebar shows its own bones.
  if (!overview) {
    return <Bar />;
  }
  if (!overview.on) {
    return (
      <>
        <Bar />
        {overview.off === "person" ? (
          <Empty body={t("offByYou")} title={t("offTitle")}>
            <Button
              className={cn("self-center", PRESS)}
              nativeButton={false}
              render={<Link href="/settings/account#memory" />}
              size="sm"
              variant="outline"
            >
              {t("offSettings")}
            </Button>
          </Empty>
        ) : (
          <Empty body={t("offBody")} title={t("offTitle")} />
        )}
      </>
    );
  }
  const empty =
    overview.cards.length +
      overview.questions.length +
      overview.rules.length +
      overview.me.length ===
    0;
  if (empty) {
    return (
      <>
        <Bar />
        <Empty body={t("emptyBody")} title={t("emptyTitle")} />
      </>
    );
  }

  const back = phone ? () => setPick(null) : undefined;
  const details = {
    card: card && (
      <CardView
        data={card}
        key={card.card.id}
        onBack={back}
        timeZone={timeZone}
      />
    ),
    due: (
      <div className={cn("flex min-h-0 flex-1 flex-col gap-4", ENTER)}>
        <Header hint={t("dueHint")} onBack={back} title={t("due")} />
        <DueView
          cards={overview.cards}
          due={due}
          phone={phone}
          reread={reread}
          setDue={setDue}
          timeZone={timeZone}
        />
      </div>
    ),
    me: <Me onBack={back} records={overview.me} timeZone={timeZone} />,
    questions: (
      <Questions
        answer={actions.answer}
        dismissMerge={actions.dismissMerge}
        merge={actions.merge}
        merges={overview.merges}
        onBack={back}
        questions={overview.questions}
      />
    ),
    reminders: (
      <RemindersView
        cards={overview.cards}
        due={due}
        onBack={back}
        reread={reread}
        timeZone={timeZone}
      />
    ),
    rules: <Rules onBack={back} rules={overview.rules} send={actions.rule} />,
  };
  const detail = shown ? details[shown.type] : null;
  // While searching, the records found stand over the card (on a phone, under the list and its search).
  const results = found && <Found records={found.records} />;
  const fill = !results && shown?.type === "due";
  const phoneList = <MemoryRows inline />;
  let content: React.ReactNode;
  if (phone) {
    content = results ? (
      <div className="flex flex-col gap-6">
        {phoneList}
        {results}
      </div>
    ) : (
      (detail ?? phoneList)
    );
  } else {
    content = results ?? detail ?? (
      <p className="text-muted-foreground text-sm">{t("pick")}</p>
    );
  }
  return (
    <MemoryActionsContext.Provider value={actions}>
      <Bar />
      <div className={cn("min-h-0 flex-1", !fill && "overflow-y-auto")}>
        <div className={pageClass(fill, phone)}>{content}</div>
      </div>
      <NewCardDialog
        onClose={() => setMaking(null)}
        onCreate={create}
        target={making}
        types={[
          ...new Set(overview.cards.flatMap((c) => (c.type ? [c.type] : []))),
        ]}
      />
      <NewRuleDialog
        onClose={() => setRuleOpen(false)}
        open={ruleOpen}
        send={actions.rule}
      />
      <Toaster position="bottom-right" />
    </MemoryActionsContext.Provider>
  );
};
