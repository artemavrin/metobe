"use client";

import type {
  ChatMemory,
  MemoryCard,
  MemoryCardItem,
  MemoryEntityKind,
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
  Building2,
  ChevronDown,
  ChevronLeft,
  CircleHelp,
  FolderKanban,
  ListChecks,
  MailCheck,
  Search,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState } from "react";

import { TopBar } from "@/components/chat/top-bar";

import {
  ENTER,
  MemoryActionsContext,
  MemoryRecordRow,
  PRESS,
  occurredWords,
  shortDay,
  useDirection,
} from "./memory-record";
import type { MemoryActions } from "./memory-record";

// The «Память» page (P16 «Карточки», D39): people, organizations and projects on the left with their open and overdue
// commitments, «Не записано» and «Правила»; the card on the right — commitments (important first, then by deadline),
// what is known with «Раньше», events, the closed ones folded. On a phone — the list, then the card.

type Pick =
  | { type: "card"; id: string }
  | { type: "questions" }
  | { type: "rules" };

type Question = ChatMemory["questions"][number];
type T = ReturnType<typeof useTranslations<"memory">>;

const KINDS = ["person", "org", "project"] as const;
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
  hint?: string | null;
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
        {hint && <span className="text-muted-foreground text-sm">{hint}</span>}
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
  const commitments = records.filter((r) => r.kind === "commitment");
  const open = commitments
    .filter((r) => OPEN.has(r.status ?? ""))
    // oxlint-disable-next-line unicorn/no-array-sort -- sorts the filter's own copy (toSorted is past the ES2022 target)
    .sort(byUrgency);
  const closed = commitments.filter((r) => !OPEN.has(r.status ?? ""));
  const known = records.filter(
    (r) => r.kind === "fact" || r.kind === "assessment"
  );
  const now = known.filter((r) => !r.validTo);
  const before = known.filter((r) => r.validTo);
  const events = records.filter((r) => r.kind === "event");
  const day = (iso: string | null) =>
    iso ? shortDay(iso, format, timeZone) : null;
  return (
    <div className={cn("flex flex-col gap-6", ENTER)}>
      <Header
        action={
          card.kind !== "project" &&
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
        hint={card.role}
        onBack={onBack}
        title={card.name}
      />
      {open.length > 0 && (
        <Section count={open.length} title={t("commitments")}>
          {open.map((r) => (
            <MemoryRecordRow
              key={r.id}
              lead={direction(r, card.id)}
              meta={
                r.givenAt ? t("since", { date: day(r.givenAt) ?? "" }) : null
              }
              record={r}
            />
          ))}
        </Section>
      )}
      {(now.length > 0 || before.length > 0) && (
        <Section title={t("known")}>
          {now.map((r) => (
            <MemoryRecordRow
              key={r.id}
              meta={
                r.validFrom
                  ? t("since", { date: day(r.validFrom) ?? "" })
                  : null
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
      {events.length > 0 && (
        <Section title={t("events")}>
          {events.map((r) => (
            <MemoryRecordRow
              key={r.id}
              meta={occurredWords(r, format, timeZone, t)}
              record={r}
            />
          ))}
        </Section>
      )}
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
  );
};

const NEW_LABEL: Record<
  MemoryEntityKind,
  "newPerson" | "newOrg" | "newProject"
> = {
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

const Rules = ({
  rules,
  onBack,
}: {
  rules: MemoryRecordView[];
  onBack?: () => void;
}) => {
  const t = useTranslations("memory");
  return (
    <div className={cn("flex flex-col gap-4", ENTER)}>
      <Header hint={t("rulesHint")} onBack={onBack} title={t("rules")} />
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

const Empty = ({ title, body }: { title: string; body: string }) => (
  <div
    className={cn(
      "mx-auto flex max-w-md flex-col gap-2 px-6 py-16 text-center",
      ENTER
    )}
  >
    <p className="text-sm font-medium">{title}</p>
    <p className="text-muted-foreground text-sm leading-6">{body}</p>
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

/** The page's calls: each change says so in a toast and reads the page again; a deletion offers «Вернуть». */
const useActionsOf = (
  timeZone: string,
  reread: () => Promise<void>
): MemoryActions & {
  answer: (q: Question, body: object) => Promise<void>;
} => {
  const t = useTranslations("memory");
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
    timeZone,
  };
};

const matches = (c: MemoryCardItem, words: string[]) => {
  const hay = normalize([c.name, c.role ?? "", ...c.aliases].join(" "));
  return words.every((w) => hay.includes(w));
};

const samePick = (a: Pick | null, b: Pick) =>
  a?.type === b.type &&
  (b.type !== "card" || (a.type === "card" && a.id === b.id));

const CardRow = ({ c }: { c: MemoryCardItem }) => {
  const t = useTranslations("memory");
  const counts = t("counts", { open: c.open, overdue: c.overdue });
  return (
    <>
      <Avatar kind={c.kind} name={c.name} size="size-7" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm">{c.name}</span>
        {c.role && (
          <span className="text-muted-foreground truncate text-xs">
            {c.role}
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
const CardList = ({
  overview,
  q,
  setQ,
  shown,
  onPick,
  nothing,
}: {
  overview: MemoryOverview;
  q: string;
  setQ: (q: string) => void;
  shown: Pick | null;
  onPick: (p: Pick) => void;
  nothing: boolean;
}) => {
  const t = useTranslations("memory");
  const words = normalize(q).split(/\s+/u).filter(Boolean);
  const cards = overview.cards.filter((c) => matches(c, words));
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
      {KINDS.map((kind) => {
        const of = cards.filter((c) => c.kind === kind);
        return (
          of.length > 0 && (
            <div className="flex flex-col gap-0.5" key={kind}>
              <span className="text-muted-foreground px-2 pb-1 text-xs">
                {t(`kinds.${kind}`)}
              </span>
              {of.map((c) =>
                item({ id: c.id, type: "card" }, c.id, <CardRow c={c} />)
              )}
            </div>
          )
        );
      })}
      {!q &&
        item(
          { type: "rules" },
          "rules",
          <>
            <ListChecks className="text-muted-foreground size-4 shrink-0" />
            <span className="flex-1 text-sm">{t("rules")}</span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {overview.rules.length}
            </span>
          </>
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
  // On a wide screen the first card is open from the start; on a phone the list comes first.
  const [first] = initial.cards;
  const shown: Pick | null =
    pick ?? (phone || !first ? null : { id: first.id, type: "card" });
  const cardId = shown?.type === "card" ? shown.id : null;
  const { card, found, overview, reread } = useMemoryData(initial, cardId, q);
  const actions = useActionsOf(timeZone, reread);

  if (!overview.on) {
    return (
      <>
        <Bar />
        <Empty body={t("offBody")} title={t("offTitle")} />
      </>
    );
  }
  const empty =
    overview.cards.length +
      overview.questions.length +
      overview.rules.length ===
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
    questions: (
      <Questions
        answer={actions.answer}
        onBack={back}
        questions={overview.questions}
      />
    ),
    rules: <Rules onBack={back} rules={overview.rules} />,
  };
  const detail = shown ? details[shown.type] : null;
  // While searching, the records found stand over the card.
  const results = found && <Found records={found.records} />;
  const list = (
    <CardList
      nothing={Boolean(found && found.records.length === 0)}
      onPick={setPick}
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
        <div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 pt-8 pb-16">
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
      <Toaster position="bottom-center" />
    </MemoryActionsContext.Provider>
  );
};
