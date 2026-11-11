"use client";

import type {
  MemoryCardItem,
  MemoryRecordView,
} from "@metobe/contracts/memory";
import { Button } from "@metobe/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@metobe/ui/components/dialog";
import { Input } from "@metobe/ui/components/input";
import { SidebarInput, useSidebar } from "@metobe/ui/components/sidebar";
import { Skeleton } from "@metobe/ui/components/skeleton";
import { Textarea } from "@metobe/ui/components/textarea";
import { cn } from "@metobe/ui/lib/utils";
import { useHotkey } from "@tanstack/react-hotkeys";
import {
  CalendarDays,
  CircleHelp,
  ListChecks,
  MailCheck,
  Search,
  UserRound,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import type { MouseEvent } from "react";

import {
  KindTile,
  ListHeader,
  ListHeading,
  ListLabel,
  ListRow,
  useListHighlight,
} from "@/components/sidebar-list";
import { isLate } from "@/lib/memory-late";

import { Avatar } from "./card-parts";
import { normalize, pickToSearch, samePick } from "./memory-pick";
import type { Pick } from "./memory-pick";
import { useMemoryStore } from "./memory-store";
import type { NewCardInput, NewCardTarget } from "./memory-store";

// The memory's list (P16 «Карточки», D39) as a level of the app's sidebar — the way the settings' lists are, drawn by
// the same parts (`components/sidebar-list`): the ways in (Сверка, Не записано, Календарь, Обо мне), the cards by kind
// with their open count and a dot while something is overdue, «Правила». On a phone with nothing picked the same rows
// stand in the page.

const KINDS = ["person", "group", "org", "project"] as const;

const matches = (c: MemoryCardItem, words: string[]) => {
  const hay = normalize(
    [c.name, c.role ?? "", c.type ?? "", ...c.aliases].join(" ")
  );
  return words.every((w) => hay.includes(w));
};

/** Under a card's name in the list: who they are; for a thing of the person's own kind — what it is. */
const caption = (c: MemoryCardItem) => (c.kind === "custom" ? c.type : c.role);

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

/**
 * A card by hand, in a dialog (P22): the name, and for a thing of the person's own kind in no section of its type —
 * what it is, with the words the person already uses offered. Enter or «Создать» makes it and opens it.
 */
export const NewCardDialog = ({
  target,
  types,
  onCreate,
  onClose,
}: {
  target: NewCardTarget | null;
  types: string[];
  onCreate: (input: NewCardInput) => Promise<boolean>;
  onClose: () => void;
}) => {
  const t = useTranslations("memory");
  const [name, setName] = useState("");
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const askType = target?.kind === "custom" && !target.type;
  const submit = async () => {
    const said = name.trim();
    if (!(target && said) || busy) {
      return;
    }
    setBusy(true);
    const made = await onCreate({
      kind: target.kind,
      name: said,
      type: target.type ?? (word.trim() || undefined),
    });
    setBusy(false);
    if (made) {
      onClose();
    }
  };
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      onOpenChangeComplete={(open) => {
        // The fields are blank the next time it opens.
        if (!open) {
          setName("");
          setWord("");
        }
      }}
      open={target !== null}
    >
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{target?.title}</DialogTitle>
          </DialogHeader>
          <label className="grid gap-1.5 text-sm">
            {t("newCardName")}
            <Input
              autoFocus
              disabled={busy}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
              value={name}
            />
          </label>
          {askType && (
            <label className="grid gap-1.5 text-sm">
              {t("typeLabel")}
              <Input
                disabled={busy}
                list="memory-types"
                maxLength={60}
                onChange={(e) => setWord(e.target.value)}
                placeholder={t("typeAsk")}
                value={word}
              />
              <datalist id="memory-types">
                {types.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </datalist>
            </label>
          )}
          <DialogFooter>
            <Button
              disabled={busy}
              onClick={onClose}
              type="button"
              variant="outline"
            >
              {t("cancelNew")}
            </Button>
            <Button disabled={busy || !name.trim()} type="submit">
              {t("newCardMake")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

/** A rule in words, in a dialog (P22): the memory reads it as a standing rule and picks its kind and period. */
export const NewRuleDialog = ({
  open,
  send,
  onClose,
}: {
  open: boolean;
  send: (text: string) => Promise<MemoryRecordView[] | null>;
  onClose: () => void;
}) => {
  const t = useTranslations("memory");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!text.trim() || busy) {
      return;
    }
    setBusy(true);
    const written = await send(text.trim());
    setBusy(false);
    // Nothing found or a failure: the words stay, to say it otherwise.
    if (written) {
      setText("");
      onClose();
    }
  };
  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      open={open}
    >
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("ruleAdd")}</DialogTitle>
            <DialogDescription>{t("ruleHow")}</DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label={t("ruleLabel")}
            autoFocus
            disabled={busy}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // ⌘/Ctrl + Enter sends from the field.
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={t("ruleAsk")}
            rows={3}
            value={text}
          />
          <DialogFooter>
            <Button
              disabled={busy}
              onClick={onClose}
              type="button"
              variant="outline"
            >
              {t("cancelNew")}
            </Button>
            <Button disabled={busy || !text.trim()} type="submit">
              {t("newCardMake")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

/** A click that is the list's own: a plain one; a new tab or window keeps the address. */
const plain = (e: MouseEvent) =>
  e.button === 0 && !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey);

/** The search field of the list. */
const MemoryFind = ({
  inline,
  inputRef,
}: {
  inline: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
}) => {
  const t = useTranslations("memory");
  const { q, setQ } = useMemoryStore();
  const Field = inline ? Input : SidebarInput;
  return (
    <div className="relative">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
      <Field
        aria-label={t("searchLabel")}
        autoComplete="off"
        className="pl-8"
        data-1p-ignore
        data-lpignore="true"
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("search")}
        ref={inputRef}
        type="search"
        value={q}
      />
    </div>
  );
};

/** While the list is being read: rows' bones. */
const Bones = () => (
  <div className="flex flex-col gap-0.5 px-2 pt-3">
    {Array.from({ length: 6 }, (_, i) => (
      <div className="flex items-center gap-3 px-2.5 py-2" key={i}>
        <Skeleton className="size-7 rounded-md" />
        <Skeleton className="h-3.5 w-32" />
      </div>
    ))}
  </div>
);

/** What a plain click on a row does: pick it, and leave the sidebar's sheet on a phone. */
const useGo = () => {
  const { isMobile, setOpenMobile } = useSidebar();
  const { setPick } = useMemoryStore();
  return (p: Pick) => (e: MouseEvent) => {
    if (!plain(e)) {
      return;
    }
    e.preventDefault();
    setPick(p);
    if (isMobile) {
      setOpenMobile(false);
    }
  };
};

/** A row for what is not a card: a way in, with a tile for its picture. */
const ViewRow = ({
  pick,
  icon,
  title,
  count,
  sub,
  error = false,
}: {
  pick: Exclude<Pick, { type: "card" }>;
  icon: React.ReactNode;
  title: string;
  count?: number;
  sub?: string;
  error?: boolean;
}) => {
  const { shown } = useMemoryStore();
  const go = useGo();
  return (
    <ListRow
      active={samePick(shown, pick)}
      count={count}
      entryKey={`view:${pick.type}`}
      href={pickToSearch(pick)}
      leading={<KindTile>{icon}</KindTile>}
      onClick={go(pick)}
      state={error ? "error" : "none"}
      sub={sub}
      title={title}
    />
  );
};

/** A card's row: its face, its name and role, a dot while something is overdue, how many are open. */
const CardEntry = ({ c }: { c: MemoryCardItem }) => {
  const t = useTranslations("memory");
  const { shown } = useMemoryStore();
  const go = useGo();
  const p: Pick = { id: c.id, type: "card" };
  let sub = caption(c);
  if (!sub && c.overdue > 0) {
    sub = t("overdueCount", { count: c.overdue });
  }
  return (
    <ListRow
      active={samePick(shown, p)}
      count={c.open > 0 ? c.open : undefined}
      entryKey={`card:${c.id}`}
      href={pickToSearch(p)}
      leading={<Avatar kind={c.kind} name={c.name} size="size-7" />}
      onClick={go(p)}
      state={c.overdue > 0 ? "error" : "none"}
      sub={sub ?? undefined}
      tip={t("counts", { open: c.open, overdue: c.overdue })}
      title={c.name}
    />
  );
};

/** A group of cards under its heading — with «+» for a new card there, or, while searching, the text alone. */
const CardGroup = ({
  title,
  of,
  made,
}: {
  title: string;
  of: MemoryCardItem[];
  made: { kind: MemoryCardItem["kind"]; type?: string };
}) => {
  const t = useTranslations("memory");
  const { q, setMaking } = useMemoryStore();
  if (q && of.length === 0) {
    return null;
  }
  const label = t("newCardIn", { section: title });
  return (
    <>
      {q ? (
        <ListLabel title={title} />
      ) : (
        <ListHeading
          add={{
            label,
            onClick: () =>
              setMaking({ kind: made.kind, title: label, type: made.type }),
          }}
          title={title}
        />
      )}
      {of.map((c) => (
        <CardEntry c={c} key={c.id} />
      ))}
    </>
  );
};

/** The ways in at the top: Сверка, Не записано, Календарь, Обо мне. */
const Ways = () => {
  const t = useTranslations("memory");
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const { due, overview, stale, timeZone } = useMemoryStore();
  const late = due
    ? due.rows.filter((r) => isLate(r, due.today, timeZone)).length
    : 0;
  return (
    <>
      {stale > 0 && (
        <ListRow
          active={pathname === "/memory/review"}
          count={stale}
          entryKey="review"
          href="/memory/review"
          leading={
            <KindTile>
              <MailCheck className="text-warning" />
            </KindTile>
          }
          onClick={() => isMobile && setOpenMobile(false)}
          title={t("reviewTitle")}
        />
      )}
      {(overview?.questions.length ?? 0) > 0 && (
        <ViewRow
          count={overview?.questions.length}
          icon={<CircleHelp className="text-warning" />}
          pick={{ type: "questions" }}
          title={t("questions")}
        />
      )}
      <ViewRow
        error={late > 0}
        icon={<CalendarDays />}
        pick={{ type: "due" }}
        sub={late > 0 ? t("dueLate", { count: late }) : undefined}
        title={t("due")}
      />
      {(overview?.me.length ?? 0) > 0 && (
        <ViewRow
          count={overview?.me.length}
          icon={<UserRound />}
          pick={{ type: "me" }}
          title={t("me")}
        />
      )}
    </>
  );
};

/** The rows: the ways in, then the cards by kind, then «Правила». */
export const MemoryRows = ({ inline = false }: { inline?: boolean }) => {
  const t = useTranslations("memory");
  const pathname = usePathname();
  const { found, overview, q, setRuleOpen, shown } = useMemoryStore();
  const words = normalize(q).split(/\s+/u).filter(Boolean);
  const cards = (overview?.cards ?? []).filter((c) => matches(c, words));
  const things = thingSections(cards);
  let activeKey: string | undefined;
  if (pathname === "/memory/review") {
    activeKey = "review";
  } else if (shown) {
    activeKey =
      shown.type === "card" ? `card:${shown.id}` : `view:${shown.type}`;
  }
  const { highlight, ref } = useListHighlight(activeKey);
  if (!overview) {
    return <Bones />;
  }
  if (!overview.on) {
    return null;
  }
  return (
    <>
      {inline && <MemoryFind inline />}
      <nav
        className={cn("relative flex flex-col gap-0.5", !inline && "px-2 pb-3")}
        ref={ref}
      >
        {highlight}
        {!q && <Ways />}
        {KINDS.map((kind) => (
          <CardGroup
            key={kind}
            made={{ kind }}
            of={cards.filter((c) => c.kind === kind)}
            title={t(`kinds.${kind}`)}
          />
        ))}
        {things.sections.map((one) => (
          <CardGroup
            key={`type:${one.type}`}
            made={{ kind: "custom", type: one.type }}
            of={one.cards}
            title={one.title}
          />
        ))}
        <CardGroup
          made={{ kind: "custom" }}
          of={things.other}
          title={t("kinds.other")}
        />
        {!q && (
          <>
            <ListHeading
              add={{ label: t("ruleAdd"), onClick: () => setRuleOpen(true) }}
              title={t("rules")}
            />
            <ViewRow
              count={overview.rules.length}
              icon={<ListChecks />}
              pick={{ type: "rules" }}
              title={t("rulesOpen")}
            />
          </>
        )}
        {found && found.records.length === 0 && cards.length === 0 && (
          <p className="text-muted-foreground px-2.5 py-2 text-sm">
            {t("nothingFound")}
          </p>
        )}
      </nav>
    </>
  );
};

/** The memory's level of the app's sidebar: the way back to the chats, the title, the search, the rows. */
export const MemoryListLevel = () => {
  const t = useTranslations("memory");
  const { isMobile, setOpenMobile } = useSidebar();
  const { overview } = useMemoryStore();
  const search = useRef<HTMLInputElement>(null);
  // ⌘K searches here, where it searches the chats elsewhere.
  useHotkey("Mod+K", () => search.current?.select(), { ignoreInputs: false });
  const open = overview?.on
    ? overview.cards.reduce((sum, c) => sum + c.open, 0)
    : 0;
  const close = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };
  return (
    <>
      <ListHeader
        back={{ href: "/", label: t("backToChats"), onClick: close }}
        meta={
          overview?.on
            ? t("listMeta", { cards: overview.cards.length, open })
            : undefined
        }
        title={t("title")}
      >
        {overview?.on && <MemoryFind inline={false} inputRef={search} />}
      </ListHeader>
      <div className="min-h-0 flex-1 overflow-y-auto pt-1">
        <MemoryRows />
      </div>
    </>
  );
};
