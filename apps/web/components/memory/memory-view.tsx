"use client";

import type {
  ChatMemory,
  MemoryCard,
  MemoryCardItem,
  MemoryEntityKind,
  MemoryNoteResult,
  MemoryOverview,
  MemoryRecordView,
  MemorySearch,
} from "@metobe/contracts/memory";
import { Button } from "@metobe/ui/components/button";
import { Input } from "@metobe/ui/components/input";
import { Toaster, toast } from "@metobe/ui/components/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@metobe/ui/components/tooltip";
import { useIsMobile } from "@metobe/ui/hooks/use-mobile";
import { cn } from "@metobe/ui/lib/utils";
import {
  Box,
  Building2,
  ChevronDown,
  ChevronLeft,
  CircleHelp,
  FolderKanban,
  ListChecks,
  LoaderCircle,
  Mail,
  MailCheck,
  Pencil,
  Phone,
  Plus,
  Search,
  UserRound,
  Users,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { TopBar } from "@/components/chat/top-bar";
import { daysUntil } from "@/lib/memory-dates";

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
import type { MemoryActions } from "./memory-record";

// The «Память» page (P16 «Карточки», D39): people, organizations and projects on the left with their open and overdue
// commitments, «Не записано» and «Правила»; the card on the right — commitments (important first, then by deadline),
// what is known with «Раньше», events, the closed ones folded. On a phone — the list, then the card.

type Pick =
  | { type: "card"; id: string }
  | { type: "me" }
  | { type: "questions" }
  | { type: "rules" };

type Question = ChatMemory["questions"][number];
type T = ReturnType<typeof useTranslations<"memory">>;

const KINDS = ["person", "group", "org", "project"] as const;
const OPEN = new Set(["open", "unconfirmed"]);
const SEARCH_DELAY_MS = 250;

const normalize = (s: string) => s.toLocaleLowerCase("ru").replaceAll("ё", "е");

const Avatar = ({
  kind,
  name,
  size = "size-8",
}: {
  kind: MemoryCardItem["kind"];
  name: string;
  size?: string;
}) => {
  const initials = name
    .replaceAll(/[«»"]/gu, "")
    .split(/\s+/u)
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
  let face: React.ReactNode = initials;
  if (kind === "org") {
    face = <Building2 className="size-3.5" />;
  } else if (kind === "project") {
    face = <FolderKanban className="size-3.5" />;
  } else if (kind === "group") {
    face = <Users className="size-3.5" />;
  } else if (kind === "custom") {
    face = <Box className="size-3.5" />;
  }
  return (
    <span
      aria-hidden
      className={cn(
        "bg-muted text-muted-foreground flex shrink-0 items-center justify-center rounded-full text-[11px] font-medium",
        size
      )}
    >
      {face}
    </span>
  );
};

const Section = ({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) => (
  <section className="flex flex-col gap-1">
    <h3 className="text-muted-foreground flex items-center gap-1.5 px-2 text-xs font-medium">
      {title}
      {count !== undefined && <span className="tabular-nums">{count}</span>}
    </h3>
    <ul className="flex flex-col">{children}</ul>
  </section>
);

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

/** Open commitments: «важно» first, then the nearest deadline, those without one last. */
const byUrgency = (a: MemoryRecordView, b: MemoryRecordView) =>
  Number(b.important) - Number(a.important) ||
  (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999") ||
  b.recordedAt.localeCompare(a.recordedAt);

const Header = ({
  title,
  hint,
  onBack,
  avatar,
  action,
}: {
  title: string;
  hint?: React.ReactNode;
  onBack?: () => void;
  avatar?: React.ReactNode;
  action?: React.ReactNode;
}) => {
  const t = useTranslations("memory");
  return (
    <header className="flex items-center gap-3">
      {onBack && (
        <Button
          aria-label={t("back")}
          onClick={onBack}
          size="icon-sm"
          variant="ghost"
        >
          <ChevronLeft />
        </Button>
      )}
      {avatar}
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 className="text-lg font-semibold tracking-tight break-words">
          {title}
        </h2>
        {typeof hint === "string" ? (
          <span className="text-muted-foreground text-sm">{hint}</span>
        ) : (
          hint
        )}
      </div>
      {action}
    </header>
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
  return `/?say=${encodeURIComponent(t("checkAsk", { items, name: card.name }))}`;
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

/**
 * «Что сейчас» (P22): three figures in a row instead of a paragraph — the last contact, how often a rule wants one,
 * what is open and past its day. Lines, not a panel. Longer without contact than the rule wants — the warning colour.
 */
const Now = ({ data, timeZone }: { data: MemoryCard; timeZone: string }) => {
  const t = useTranslations("memory");
  const { card, contact } = data;
  if (!contact || data.records.length === 0) {
    return null;
  }
  const days = contact.last
    ? -daysUntil(new Date(contact.last), new Date(), timeZone)
    : null;
  const late = contact.every !== null && days !== null && days > contact.every;
  const cells: [string, React.ReactNode][] = [
    [
      t("lastContact"),
      <span className={cn(late && "text-warning")} key="last">
        {days === null ? t("contactNever") : t("contactAgo", { days })}
      </span>,
    ],
    ...(contact.every === null
      ? []
      : ([[t("rhythm"), t("rhythmEvery", { days: contact.every })]] as [
          string,
          React.ReactNode,
        ][])),
    [
      t("openNow"),
      card.open > 0 ? (
        <>
          {card.open}
          {card.overdue > 0 && (
            <span className="text-destructive">
              , {t("overdueCount", { count: card.overdue })}
            </span>
          )}
        </>
      ) : (
        t("openNone")
      ),
    ],
  ];
  return (
    <dl
      className={cn(
        "grid divide-x border-y @max-md:grid-cols-1 @max-md:divide-x-0 @max-md:divide-y",
        cells.length === 3 ? "grid-cols-3" : "grid-cols-2"
      )}
    >
      {cells.map(([label, value], i) => (
        <div
          className={cn(
            // The first lines up with the rows under it.
            "flex flex-col gap-0.5 py-2.5 @max-md:flex-row @max-md:items-baseline @max-md:justify-between @max-md:px-2",
            i > 0 ? "pl-4" : "pl-2"
          )}
          key={label}
        >
          <dt className="text-muted-foreground text-xs">{label}</dt>
          <dd className="text-sm font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
};

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
  focus = false,
}: {
  label: string;
  placeholder: string;
  /** Hands the words over; the records they made — none when nothing went in. */
  send: (text: string) => Promise<MemoryRecordView[] | null>;
  onWritten: (ids: string[]) => void;
  /** Opened by the press on a «+»: the field is ready at once. */
  focus?: boolean;
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
    if (focus) {
      field.current?.focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "n" || typing(e)) {
        return;
      }
      e.preventDefault();
      field.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus]);
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

/** «Ждёте» and «Вы обещали» side by side (P22 «Баланс»); nothing when neither has anything open. */
const Balance = ({
  theirs,
  mine,
  day,
}: {
  theirs: MemoryRecordView[];
  mine: MemoryRecordView[];
  /** A short day in the person's zone. */
  day: (iso: string) => string;
}) => {
  const t = useTranslations("memory");
  if (theirs.length + mine.length === 0) {
    return null;
  }
  return (
    <div className="grid gap-x-10 gap-y-6 @2xl:grid-cols-2">
      {(
        [
          [t("waiting"), theirs],
          [t("youPromised"), mine],
        ] as const
      ).map(([title, list]) => (
        <Section count={list.length} key={title} title={title}>
          {list.length > 0 ? (
            list.map((r) => (
              <MemoryRecordRow
                key={r.id}
                meta={t("givenOn", {
                  date: day(r.givenAt ?? r.recordedAt) ?? "",
                })}
                record={r}
              />
            ))
          ) : (
            <li className="text-muted-foreground/70 px-2 py-1.5 text-sm">
              {t("nothingOpen")}
            </li>
          )}
        </Section>
      ))}
    </div>
  );
};

/** Who has to do it. */
const debtorOf = (r: MemoryRecordView) =>
  r.entities.find((e) => e.role === "debtor");

/**
 * «Баланс» (P22): what they owe and what you owe, apart; promises between others — and every promise on a group's or
 * a project's card — stay one list.
 */
const sidesOf = (card: MemoryCardItem, open: MemoryRecordView[]) => {
  const split = card.kind === "person" || card.kind === "org";
  const theirs = split ? open.filter((r) => debtorOf(r)?.id === card.id) : [];
  const mine = split ? open.filter((r) => debtorOf(r)?.kind === "self") : [];
  const others = open.filter((r) => !(theirs.includes(r) || mine.includes(r)));
  return { mine, others, split, theirs };
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
            card.kind !== "project" &&
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
            )
          }
          avatar={<Avatar kind={card.kind} name={card.name} size="size-10" />}
          hint={<Hint data={data} />}
          onBack={onBack}
          title={card.name}
        />
        <Now data={data} timeZone={timeZone} />
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
  answer,
  onBack,
}: {
  questions: Question[];
  answer: (q: Question, body: object) => Promise<void>;
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
      {questions.length === 0 && (
        <p className="text-muted-foreground text-sm">{t("allSorted")}</p>
      )}
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
  focus,
}: {
  rules: MemoryRecordView[];
  onBack?: () => void;
  /** A rule in words (`POST /api/memory/rules`). */
  send: (text: string) => Promise<MemoryRecordView[] | null>;
  focus: boolean;
}) => {
  const t = useTranslations("memory");
  const [fresh, setFresh] = useState<string[]>([]);
  return (
    <FreshContext value={fresh}>
      <div className={cn("flex flex-col gap-4", ENTER)}>
        <Header hint={t("rulesHint")} onBack={onBack} title={t("rules")} />
        <NoteLine
          focus={focus}
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

const readJson = async <Data,>(url: string) => {
  const response = await fetch(url, { cache: "no-store" });
  return response.ok ? ((await response.json()) as Data) : null;
};
const searchUrl = (query: string) =>
  `/api/memory/search?q=${encodeURIComponent(query)}`;

/**
 * What the page reads: the list (from the page at first), the open card and what the search finds. After a change
 * `reread` reads everything open again.
 */
const useMemoryData = (
  initial: MemoryOverview,
  cardId: string | null,
  q: string
) => {
  const [overview, setOverview] = useState(initial);
  const [card, setCard] = useState<MemoryCard | null>(null);
  const [found, setFound] = useState<{ q: string; data: MemorySearch } | null>(
    null
  );
  const query = q.trim();

  useEffect(() => {
    if (!cardId) {
      return;
    }
    let live = true;
    const read = async () => {
      const data = await readJson<MemoryCard>(`/api/memory/cards/${cardId}`);
      if (live) {
        setCard(data);
      }
    };
    read();
    return () => {
      live = false;
    };
  }, [cardId]);

  useEffect(() => {
    if (!query) {
      return;
    }
    let live = true;
    const timer = setTimeout(async () => {
      const data = await readJson<MemorySearch>(searchUrl(query));
      if (live && data) {
        setFound({ data, q: query });
      }
    }, SEARCH_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query]);

  const reread = async () => {
    const [list, open, search] = await Promise.all([
      readJson<MemoryOverview>("/api/memory"),
      cardId ? readJson<MemoryCard>(`/api/memory/cards/${cardId}`) : null,
      query ? readJson<MemorySearch>(searchUrl(query)) : null,
    ]);
    if (list) {
      setOverview(list);
    }
    if (cardId) {
      setCard(open);
    }
    if (search) {
      setFound({ data: search, q: query });
    }
  };

  return {
    // A card read for another pick is not shown under this one.
    card: card && card.card.id === cardId ? card : null,
    found: query && found?.q === query ? found.data : null,
    overview,
    reread,
  };
};

/** Which part of the card a record is shown in, seen from that card: «Ждёте», «Вы обещали», «Известно»… */
const sectionOf = (r: MemoryRecordView, cardId: string, t: T) => {
  if (r.kind === "commitment") {
    const debtor = debtorOf(r);
    if (debtor?.id === cardId) {
      return t("waiting");
    }
    return debtor?.kind === "self" ? t("youPromised") : t("otherPromises");
  }
  if (r.kind === "event") {
    return t("events");
  }
  return r.kind === "rule" ? t("rules") : t("known");
};

/** The page's calls: each change says so in a toast and reads the page again; a deletion offers «Вернуть». */
const useActionsOf = (
  timeZone: string,
  reread: () => Promise<void>
): MemoryActions & {
  answer: (q: Question, body: object) => Promise<void>;
  rule: (text: string) => Promise<MemoryRecordView[] | null>;
} => {
  const t = useTranslations("memory");
  /**
   * A note or a rule in words goes to the memory, which picks what it is: the toast says where it lay (with «Отменить»),
   * that nothing was found, or that it will be written later. The records it made — none when nothing went in.
   */
  const send = async (
    url: string,
    text: string,
    section: (r: MemoryRecordView) => string
  ): Promise<MemoryRecordView[] | null> => {
    const response = await fetch(url, {
      body: JSON.stringify({ text }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const result = response.ok
      ? ((await response.json()) as MemoryNoteResult)
      : null;
    if (!result || result.status === "failed" || result.status === "off") {
      toast.error(t("failed"));
      return null;
    }
    if (result.status === "skipped") {
      toast(t("noteNothing"));
      return null;
    }
    if (result.status === "queued") {
      toast(t("noteLater"));
      return [];
    }
    await reread();
    const [first] = result.records;
    if (!first) {
      toast(t("noteAsked"));
      return [];
    }
    const { writeId } = result;
    const words = {
      count: result.records.length - 1,
      section: section(first),
      text: first.text,
    };
    toast(
      result.records.length > 1
        ? t("noteSavedMore", words)
        : t("noteSaved", words),
      writeId
        ? {
            action: {
              label: t("undo"),
              onClick: async () => {
                await fetch(`/api/memory/writes/${writeId}/undo`, {
                  method: "POST",
                });
                await reread();
                toast(t("undone"));
              },
            },
          }
        : undefined
    );
    return result.records;
  };

  return {
    answer: async (question, body) => {
      const response = await fetch(`/api/memory/questions/${question.id}`, {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!(response.ok || response.status === 404)) {
        toast.error(t("failed"));
        return;
      }
      toast("dismiss" in body ? t("notRemembered") : t("answered"));
      await reread();
    },
    note: (card, text) =>
      send(`/api/memory/cards/${card.id}/notes`, text, (r) =>
        sectionOf(r, card.id, t)
      ),
    patch: async (id, patch, saved) => {
      const response = await fetch(`/api/memory/records/${id}`, {
        body: JSON.stringify(patch),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      });
      if (!response.ok) {
        toast.error(t("failed"));
        return;
      }
      toast(t(saved as "saved"));
      await reread();
    },
    patchCard: async (id, patch) => {
      const response = await fetch(`/api/memory/cards/${id}`, {
        body: JSON.stringify(patch),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      });
      if (!response.ok) {
        toast.error(t("failed"));
        return;
      }
      toast(t("saved"));
      await reread();
    },
    remove: async (id) => {
      const response = await fetch(`/api/memory/records/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        toast.error(t("failed"));
        return;
      }
      await reread();
      toast(t("deleted"), {
        action: {
          label: t("restore"),
          onClick: async () => {
            await fetch(`/api/memory/records/${id}/restore`, {
              method: "POST",
            });
            await reread();
          },
        },
      });
    },
    rule: (text) => send("/api/memory/rules", text, () => t("rules")),
    timeZone,
  };
};

const matches = (c: MemoryCardItem, words: string[]) => {
  const hay = normalize(
    [c.name, c.role ?? "", c.type ?? "", ...c.aliases].join(" ")
  );
  return words.every((w) => hay.includes(w));
};

const samePick = (a: Pick | null, b: Pick) =>
  a?.type === b.type &&
  (b.type !== "card" || (a.type === "card" && a.id === b.id));

/** Under a card's name in the list: who they are; for a thing of the person's own kind — what it is. */
const caption = (c: MemoryCardItem) => (c.kind === "custom" ? c.type : c.role);

const CardRow = ({ c }: { c: MemoryCardItem }) => {
  const t = useTranslations("memory");
  const counts = t("counts", { open: c.open, overdue: c.overdue });
  return (
    <>
      <Avatar kind={c.kind} name={c.name} size="size-7" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm">{c.name}</span>
        {caption(c) && (
          <span className="text-muted-foreground truncate text-xs">
            {caption(c)}
          </span>
        )}
      </span>
      {c.open > 0 && (
        <span
          className="text-muted-foreground flex items-center gap-1.5 text-xs tabular-nums"
          title={counts}
        >
          {c.overdue > 0 && (
            <span
              aria-hidden
              className="bg-destructive size-1.5 rounded-full"
            />
          )}
          <span aria-hidden>{c.open}</span>
          <span className="sr-only">{counts}</span>
        </span>
      )}
    </>
  );
};

/** The left column: search, «Не записано», cards by kind (open/overdue on the right), «Правила». */
/** What a hand-made card is: its kind, and for a thing of the person's own kind — the word for what it is. */
interface NewCardInput {
  kind: MemoryCardItem["kind"];
  name: string;
  type?: string;
}

/** A heading of the list with a «+» that appears on hover (always on a touch screen). */
const SectionHeading = ({
  title,
  label,
  onAdd,
}: {
  title: string;
  label: string;
  onAdd: () => void;
}) => (
  <div className="group/head flex items-center justify-between ps-2">
    <span className="text-muted-foreground py-1 text-xs">{title}</span>
    <button
      aria-label={label}
      className="text-muted-foreground hover:text-foreground flex size-6 items-center justify-center rounded-md opacity-0 transition-[opacity,color] duration-150 group-hover/head:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-60"
      onClick={onAdd}
      type="button"
    >
      <Plus className="size-3.5" />
    </button>
  </div>
);

/**
 * A card by hand: the name, and for a thing of the person's own kind (no word for it given by the section) what it is.
 * Enter makes it and opens it; Escape or leaving it empty closes it.
 */
const NewCard = ({
  kind,
  type,
  onCreate,
  onClose,
}: {
  kind: MemoryCardItem["kind"];
  type?: string;
  onCreate: (input: NewCardInput) => Promise<boolean>;
  onClose: () => void;
}) => {
  const t = useTranslations("memory");
  const [name, setName] = useState("");
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const wordField = useRef<HTMLInputElement>(null);
  const askType = kind === "custom" && !type;
  const submit = async () => {
    const said = name.trim();
    if (!said || busy) {
      return;
    }
    setBusy(true);
    const made = await onCreate({
      kind,
      name: said,
      type: type ?? (word.trim() || undefined),
    });
    setBusy(false);
    if (made) {
      onClose();
    }
  };
  return (
    <form
      className="flex flex-col gap-1.5 rounded-lg px-2 py-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <input
        aria-label={t("newCardName")}
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- opened by the person's press on a «+»
        autoFocus
        className="border-foreground/30 border-b bg-transparent text-sm outline-none"
        disabled={busy}
        maxLength={200}
        onBlur={(e) => {
          // Leaving the line with nothing typed closes it.
          if (!(name || word || e.relatedTarget === wordField.current)) {
            onClose();
          }
        }}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onClose();
          }
        }}
        placeholder={t("newCardName")}
        value={name}
      />
      {askType && (
        <input
          aria-label={t("typeLabel")}
          className="border-foreground/30 border-b bg-transparent text-sm outline-none"
          disabled={busy}
          maxLength={60}
          onChange={(e) => setWord(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              onClose();
            }
          }}
          placeholder={t("typeAsk")}
          ref={wordField}
          value={word}
        />
      )}
      <button className="sr-only" type="submit">
        {t("newCardMake")}
      </button>
    </form>
  );
};

/** A word as a heading: «автобус» — «Автобус». */
const capitalized = (word: string) =>
  word.slice(0, 1).toLocaleUpperCase("ru") + word.slice(1);

/**
 * The person's own kinds of card (D42) as sections of the list: a kind with two cards or more is a section under its
 * own word; the lone ones and those of no known kind wait together under «Другое».
 */
const thingSections = (cards: MemoryCardItem[]) => {
  const by = new Map<string, MemoryCardItem[]>();
  for (const c of cards) {
    if (c.kind === "custom") {
      by.set(c.type ?? "", [...(by.get(c.type ?? "") ?? []), c]);
    }
  }
  const sections = [...by].filter(([type, of]) => type && of.length > 1);
  const apart = new Set(sections.flatMap(([, of]) => of));
  return {
    other: cards.filter((c) => c.kind === "custom" && !apart.has(c)),
    sections: sections.map(([type, of]) => ({
      cards: of,
      title: capitalized(type),
      type,
    })),
  };
};

const CardList = ({
  overview,
  q,
  setQ,
  shown,
  onPick,
  nothing,
  onCreate,
  onRule,
}: {
  overview: MemoryOverview;
  q: string;
  setQ: (q: string) => void;
  shown: Pick | null;
  onPick: (p: Pick) => void;
  nothing: boolean;
  /** Makes a card by hand; false — it was not made. */
  onCreate: (input: NewCardInput) => Promise<boolean>;
  /** «+» next to «Правила»: the rules page with its line ready. */
  onRule: () => void;
}) => {
  const t = useTranslations("memory");
  const [adding, setAdding] = useState<string | null>(null);
  const words = normalize(q).split(/\s+/u).filter(Boolean);
  const cards = overview.cards.filter((c) => matches(c, words));
  const things = thingSections(cards);
  const item = (p: Pick, key: string, children: React.ReactNode) => (
    <button
      aria-current={samePick(shown, p) ? "true" : undefined}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-150",
        samePick(shown, p) ? "bg-muted" : "hover:bg-muted/50"
      )}
      key={key}
      onClick={() => onPick(p)}
      type="button"
    >
      {children}
    </button>
  );
  /** A section of the list: its heading with «+» (while not searching), the form for a new card, its cards. */
  const section = (
    key: string,
    title: string,
    of: MemoryCardItem[],
    made: { kind: MemoryCardItem["kind"]; type?: string }
  ) => {
    if (q && of.length === 0) {
      return null;
    }
    return (
      <div className="flex flex-col gap-0.5" key={key}>
        {q ? (
          <span className="text-muted-foreground px-2 pb-1 text-xs">
            {title}
          </span>
        ) : (
          <SectionHeading
            label={t("newCardIn", { section: title })}
            onAdd={() => setAdding(key)}
            title={title}
          />
        )}
        {adding === key && (
          <NewCard
            kind={made.kind}
            onClose={() => setAdding(null)}
            onCreate={onCreate}
            type={made.type}
          />
        )}
        {of.map((c) =>
          item({ id: c.id, type: "card" }, c.id, <CardRow c={c} />)
        )}
      </div>
    );
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          aria-label={t("searchLabel")}
          className="pl-8"
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("search")}
          type="search"
          value={q}
        />
      </div>
      {!q &&
        overview.questions.length > 0 &&
        item(
          { type: "questions" },
          "questions",
          <>
            <CircleHelp className="text-warning size-4 shrink-0" />
            <span className="flex-1 text-sm font-medium">{t("questions")}</span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {overview.questions.length}
            </span>
          </>
        )}
      {!q &&
        overview.me.length > 0 &&
        item(
          { type: "me" },
          "me",
          <>
            <UserRound className="text-muted-foreground size-4 shrink-0" />
            <span className="flex-1 text-sm">{t("me")}</span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {overview.me.length}
            </span>
          </>
        )}
      {KINDS.map((kind) =>
        section(
          kind,
          t(`kinds.${kind}`),
          cards.filter((c) => c.kind === kind),
          { kind }
        )
      )}
      {things.sections.map((one) =>
        section(`type:${one.type}`, one.title, one.cards, {
          kind: "custom",
          type: one.type,
        })
      )}
      {section("other", t("kinds.other"), things.other, { kind: "custom" })}
      {!q && (
        <div className="group/head relative">
          {item(
            { type: "rules" },
            "rules",
            <>
              <ListChecks className="text-muted-foreground size-4 shrink-0" />
              <span className="flex-1 text-sm">{t("rules")}</span>
              <span className="text-muted-foreground me-7 text-xs tabular-nums">
                {overview.rules.length}
              </span>
            </>
          )}
          <button
            aria-label={t("ruleAdd")}
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-md opacity-0 transition-[opacity,color] duration-150 group-hover/head:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-60"
            onClick={onRule}
            type="button"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      )}
      {nothing && cards.length === 0 && (
        <p className="text-muted-foreground px-2 text-sm">
          {t("nothingFound")}
        </p>
      )}
    </div>
  );
};

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

export const MemoryView = ({
  initial,
  timeZone,
  start,
}: {
  initial: MemoryOverview;
  timeZone: string;
  /** A card to open at once (`?card=`). */
  start?: string;
}) => {
  const t = useTranslations("memory");
  const phone = useIsMobile();
  const [pick, setPick] = useState<Pick | null>(
    start ? { id: start, type: "card" } : null
  );
  const [q, setQ] = useState("");
  // «+» next to «Правила»: the rules page opens with its line ready (counted: each press opens it anew).
  const [ruling, setRuling] = useState(0);
  // On a wide screen the first card is open from the start; on a phone the list comes first.
  const [first] = initial.cards;
  const shown: Pick | null =
    pick ?? (phone || !first ? null : { id: first.id, type: "card" });
  const cardId = shown?.type === "card" ? shown.id : null;
  const { card, found, overview, reread } = useMemoryData(initial, cardId, q);
  const actions = useActionsOf(timeZone, reread);
  /** A card by hand: it comes back made (or found, if the name was there), the list is read again, the card opens. */
  const create = async (input: NewCardInput) => {
    const response = await fetch("/api/memory/cards", {
      body: JSON.stringify(input),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (!response.ok) {
      toast.error(t("failed"));
      return false;
    }
    const made = (await response.json()) as {
      card: MemoryCardItem;
      existed: boolean;
    };
    if (made.existed) {
      toast(t("cardExisted", { name: made.card.name }));
    }
    await reread();
    setRuling(0);
    setPick({ id: made.card.id, type: "card" });
    return true;
  };

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
    me: <Me onBack={back} records={overview.me} timeZone={timeZone} />,
    questions: (
      <Questions
        answer={actions.answer}
        onBack={back}
        questions={overview.questions}
      />
    ),
    rules: (
      <Rules
        focus={ruling > 0}
        key={ruling}
        onBack={back}
        rules={overview.rules}
        send={actions.rule}
      />
    ),
  };
  const detail = shown ? details[shown.type] : null;
  // While searching, the records found stand over the card.
  const results = found && <Found records={found.records} />;
  const list = (
    <CardList
      nothing={Boolean(found && found.records.length === 0)}
      onCreate={create}
      onPick={(p) => {
        setRuling(0);
        setPick(p);
      }}
      onRule={() => {
        setPick({ type: "rules" });
        setRuling((n) => n + 1);
      }}
      overview={overview}
      q={q}
      setQ={setQ}
      shown={shown}
    />
  );
  const wide = (
    <div className="flex min-h-0 flex-1">
      <div className="w-72 shrink-0 overflow-y-auto border-r p-3">{list}</div>
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 pt-8 pb-16">
          {results ?? detail ?? (
            <p className="text-muted-foreground text-sm">{t("pick")}</p>
          )}
        </div>
      </div>
    </div>
  );
  const narrow = (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      {results ? (
        <div className="flex flex-col gap-6">
          {list}
          {results}
        </div>
      ) : (
        (detail ?? list)
      )}
    </div>
  );
  return (
    <MemoryActionsContext.Provider value={actions}>
      <Bar />
      {phone ? narrow : wide}
      <Toaster position="bottom-right" />
    </MemoryActionsContext.Provider>
  );
};
