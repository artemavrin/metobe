"use client";

import type {
  MemoryRecordSource,
  MemoryRecordView,
  MemoryStatus,
} from "@metobe/contracts/memory";
import { Button } from "@metobe/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@metobe/ui/components/dropdown-menu";
import { Input } from "@metobe/ui/components/input";
import { cn } from "@metobe/ui/lib/utils";
import {
  CalendarClock,
  Check,
  CircleCheck,
  Ellipsis,
  Pencil,
  Quote,
  RotateCcw,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { createContext, use, useEffect, useState } from "react";

import { daysUntil, moveTargets } from "@/lib/memory-dates";

// A record on the «Память» page (P16, D39): its text, who promised whom, the deadline in words, «Выполнено» or
// «Подтвердить»; the menu — «Откуда» with the history, «Изменить» in place, «Перенести срок», «важно», cancel,
// delete with «Вернуть».

export const ENTER =
  "animate-in fade-in slide-in-from-bottom-1 motion-reduce:slide-in-from-bottom-0 fill-mode-both duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]";
export const PRESS =
  "transition-[background-color,border-color,color,scale] duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100";

export interface RecordPatch {
  text?: string;
  status?: MemoryStatus;
  dueAt?: string | null;
  important?: boolean;
}

/** What a row needs from the page: the person's zone, and the calls that change the memory. */
export interface MemoryActions {
  timeZone: string;
  /** `saved` — the toast's key in `memory`. */
  patch: (id: string, patch: RecordPatch, saved: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const MemoryActionsContext = createContext<MemoryActions | null>(null);

const useActions = () => {
  const actions = use(MemoryActionsContext);
  if (!actions) {
    throw new Error("memory: a record outside the page");
  }
  return actions;
};

type Formatter = ReturnType<typeof useFormatter>;

export const shortDay = (iso: string, format: Formatter, timeZone: string) =>
  format.dateTime(new Date(iso), { day: "numeric", month: "short", timeZone });

/** When an event happened, as exactly as it is known. */
export const occurredWords = (
  r: MemoryRecordView,
  format: Formatter,
  timeZone: string,
  t: ReturnType<typeof useTranslations<"memory">>
) => {
  if (!r.occurredAt) {
    return null;
  }
  const at = new Date(r.occurredAt);
  switch (r.occurredPrecision) {
    case "year": {
      return format.dateTime(at, { timeZone, year: "numeric" });
    }
    case "month": {
      return format.dateTime(at, { month: "long", timeZone, year: "numeric" });
    }
    case "week": {
      return t("onWeek", { date: shortDay(r.occurredAt, format, timeZone) });
    }
    default: {
      return shortDay(r.occurredAt, format, timeZone);
    }
  }
};

/** «просрочено на 2 дн.», «сегодня», «завтра», «через 5 дн.», «до 30 ноя». */
const DueWords = ({ due }: { due: string }) => {
  const t = useTranslations("memory");
  const format = useFormatter();
  const { timeZone } = useActions();
  const days = daysUntil(new Date(due), new Date(), timeZone);
  if (days < 0) {
    return (
      <span className="text-destructive">{t("overdue", { days: -days })}</span>
    );
  }
  if (days === 0) {
    return <span className="text-foreground">{t("today")}</span>;
  }
  if (days === 1) {
    return <>{t("tomorrow")}</>;
  }
  if (days <= 7) {
    return <>{t("inDays", { days })}</>;
  }
  return <>{t("by", { date: shortDay(due, format, timeZone) })}</>;
};

/** Who promised whom, seen from the card it is shown on: «Обещано вам», «Вы обещали», «Обещано: Игорь Белов». */
export const useDirection = () => {
  const t = useTranslations("memory");
  return (r: MemoryRecordView, cardId?: string) => {
    const debtor = r.entities.find((e) => e.role === "debtor");
    const creditor = r.entities.find((e) => e.role === "creditor");
    const name = (e?: (typeof r.entities)[number]) =>
      e?.kind === "self" ? t("you") : (e?.name ?? "—");
    if (cardId) {
      if (creditor?.kind === "self") {
        return t("toYou");
      }
      if (debtor?.kind === "self") {
        return t("youPromised");
      }
      return debtor?.id === cardId
        ? t("promisedTo", { name: name(creditor) })
        : t("from", { name: name(debtor) });
    }
    if (creditor?.kind === "self") {
      return t("betweenToYou", { debtor: name(debtor) });
    }
    if (debtor?.kind === "self") {
      return t("youPromisedTo", { creditor: name(creditor) });
    }
    return t("between", { creditor: name(creditor), debtor: name(debtor) });
  };
};

const Source = ({ id, fromChat }: { id: string; fromChat: boolean }) => {
  const t = useTranslations("memory");
  const format = useFormatter();
  const { timeZone } = useActions();
  const [source, setSource] = useState<MemoryRecordSource | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    void (async () => {
      const response = await fetch(`/api/memory/records/${id}/source`, {
        cache: "no-store",
      });
      if (!live) {
        return;
      }
      if (response.ok) {
        setSource((await response.json()) as MemoryRecordSource);
      } else {
        setFailed(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [id]);
  if (failed) {
    return <p className="text-destructive text-xs">{t("loadFailed")}</p>;
  }
  if (!source) {
    return null;
  }
  const day = (iso: string) => shortDay(iso, format, timeZone);
  const status = (s: string | null) => t("status", { status: s ?? "open" });
  const due = (s: string | null) => (s ? day(s) : t("noDueShort"));
  const change = (c: MemoryRecordSource["changes"][number]) => {
    if (c.field === "status") {
      return t("changeStatus", {
        after: status(c.after),
        before: status(c.before),
      });
    }
    if (c.field === "due") {
      return t("changeDue", { after: due(c.after), before: due(c.before) });
    }
    return c.after === "true"
      ? t("changeImportantOn")
      : t("changeImportantOff");
  };
  let origin = t("byHand", { date: day(source.recordedAt) });
  if (source.chat && source.said) {
    origin = t("said", {
      chat: source.chat.title,
      date: day(source.saidAt ?? source.recordedAt),
      said: source.said,
    });
  } else if (fromChat) {
    origin = t("chatGone", { date: day(source.recordedAt) });
  }
  return (
    <div
      className={cn(
        "text-muted-foreground flex flex-col gap-1 text-xs leading-5",
        ENTER
      )}
    >
      <p className="flex gap-2">
        <Quote className="mt-1 size-3 shrink-0" />
        <span className="min-w-0 break-words">{origin}</span>
      </p>
      {source.versions.map((v) => (
        <p className="ps-5" key={v.recordedAt}>
          {t("was", { text: v.text })} · {day(v.recordedAt)}
        </p>
      ))}
      {source.changes.map((c) => (
        <p className="ps-5" key={`${c.at}:${c.field}`}>
          {change(c)} · {c.byHand ? t("markByHand") : t("markFromChat")},{" "}
          {day(c.at)}
        </p>
      ))}
    </div>
  );
};

const OPEN = new Set<MemoryStatus>(["open", "unconfirmed"]);

/** «Изменить»: the text in a field, in its place. */
const EditForm = ({
  record: r,
  onDone,
}: {
  record: MemoryRecordView;
  onDone: () => void;
}) => {
  const t = useTranslations("memory");
  const { patch } = useActions();
  const [draft, setDraft] = useState(r.text);
  return (
    <form
      className="flex flex-1 flex-wrap items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        const text = draft.trim();
        onDone();
        if (text && text !== r.text) {
          void patch(r.id, { text }, "saved");
        }
      }}
    >
      <Input
        aria-label={t("textLabel")}
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- the field replaces the text the person chose to edit
        autoFocus
        className="h-8 min-w-48 flex-1"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onDone()}
        value={draft}
      />
      <Button className={PRESS} size="sm" type="submit">
        {t("save")}
      </Button>
      <Button onClick={onDone} size="sm" type="button" variant="ghost">
        {t("dismiss")}
      </Button>
    </form>
  );
};

/** A commitment's part of the menu: «Перенести срок», «важно», cancel or open again. */
const CommitmentItems = ({ record: r }: { record: MemoryRecordView }) => {
  const t = useTranslations("memory");
  const { patch, timeZone } = useActions();
  const live = OPEN.has(r.status as MemoryStatus);
  const move = (at: Date | null) =>
    patch(r.id, { dueAt: at ? at.toISOString() : null }, "savedMoved");
  const targets = moveTargets(new Date(), timeZone);
  return (
    <>
      {live && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <CalendarClock /> {t("move")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => move(targets.tomorrow)}>
              {t("moveTomorrow")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => move(targets.dayAfter)}>
              {t("moveDayAfter")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => move(targets.monday)}>
              {t("moveMonday")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => move(targets.week)}>
              {t("moveWeek")}
            </DropdownMenuItem>
            {r.dueAt && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => move(null)}>
                  {t("noDue")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}
      <DropdownMenuItem
        onClick={() =>
          patch(
            r.id,
            { important: !r.important },
            r.important ? "savedUnimportant" : "savedImportant"
          )
        }
      >
        <Star /> {r.important ? t("unmarkImportant") : t("markImportant")}
      </DropdownMenuItem>
      {live ? (
        <DropdownMenuItem
          onClick={() => patch(r.id, { status: "cancelled" }, "savedCancelled")}
        >
          <X /> {t("cancel")}
        </DropdownMenuItem>
      ) : (
        <DropdownMenuItem
          onClick={() => patch(r.id, { status: "open" }, "savedReopened")}
        >
          <RotateCcw /> {t("reopen")}
        </DropdownMenuItem>
      )}
    </>
  );
};

const RecordMenu = ({
  record: r,
  onSource,
  onEdit,
}: {
  record: MemoryRecordView;
  onSource: () => void;
  onEdit: () => void;
}) => {
  const t = useTranslations("memory");
  const { remove } = useActions();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={t("more")}
            className="opacity-60 group-hover:opacity-100"
            size="icon-xs"
            variant="ghost"
          />
        }
      >
        <Ellipsis />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem onClick={onSource}>
          <Quote /> {t("source")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onEdit}>
          <Pencil /> {t("edit")}
        </DropdownMenuItem>
        {r.kind === "commitment" && r.status && <CommitmentItems record={r} />}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => remove(r.id)} variant="destructive">
          <Trash2 /> {t("delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/** «Выполнено» on an open commitment, «Подтвердить» on one someone else said is done. */
const Settle = ({ record: r }: { record: MemoryRecordView }) => {
  const t = useTranslations("memory");
  const { patch } = useActions();
  const said = r.status === "unconfirmed";
  return (
    <Button
      aria-label={said ? t("confirm") : t("done")}
      className={cn("opacity-70 group-hover:opacity-100", PRESS)}
      onClick={() =>
        patch(r.id, { status: "done" }, said ? "savedConfirmed" : "savedDone")
      }
      size="icon-xs"
      title={said ? t("confirm") : t("done")}
      variant="ghost"
    >
      {said ? <CircleCheck /> : <Check />}
    </Button>
  );
};

const RecordText = ({
  record: r,
  lead,
  muted,
}: {
  record: MemoryRecordView;
  lead?: string | null;
  muted?: boolean;
}) => {
  const t = useTranslations("memory");
  const said = r.status === "unconfirmed";
  const over = [lead, said ? t("status", { status: "unconfirmed" }) : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <>
      {over && (
        <span
          className={cn(
            "text-muted-foreground text-xs",
            said && "text-warning"
          )}
        >
          {over}
        </span>
      )}
      <span
        className={cn(
          "text-sm break-words",
          muted &&
            "text-muted-foreground decoration-muted-foreground/40 line-through"
        )}
      >
        {r.important && (
          <Star
            aria-label={t("important")}
            className="fill-warning text-warning me-1 inline size-3.5 -translate-y-px"
          />
        )}
        {r.text}
        {r.kind === "assessment" && (
          <span className="text-muted-foreground"> · {t("assessment")}</span>
        )}
      </span>
    </>
  );
};

/**
 * A record. `lead` — what stands over the text (who promised whom); `meta` — the date on the right for what is not
 * an open commitment with a deadline (that one shows the deadline in words).
 */
export const MemoryRecordRow = ({
  record: r,
  lead,
  meta,
  muted,
}: {
  record: MemoryRecordView;
  lead?: string | null;
  meta?: string | null;
  muted?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const live = r.kind === "commitment" && OPEN.has(r.status as MemoryStatus);
  const side = live && r.dueAt ? <DueWords due={r.dueAt} /> : (meta ?? null);
  return (
    <li
      className={cn(
        "group hover:bg-muted/40 flex flex-col gap-1.5 rounded-lg px-2 py-2",
        ENTER
      )}
    >
      {editing ? (
        <EditForm onDone={() => setEditing(false)} record={r} />
      ) : (
        <div className="flex items-start gap-2">
          <button
            aria-expanded={open}
            className="flex min-w-0 flex-1 flex-col text-left"
            onClick={() => setOpen((o) => !o)}
            type="button"
          >
            <RecordText lead={lead} muted={muted} record={r} />
          </button>
          {side && (
            <span className="text-muted-foreground shrink-0 pt-0.5 text-xs tabular-nums">
              {side}
            </span>
          )}
          {live && <Settle record={r} />}
          <RecordMenu
            onEdit={() => setEditing(true)}
            onSource={() => setOpen((o) => !o)}
            record={r}
          />
        </div>
      )}
      {open && !editing && <Source fromChat={r.fromChat} id={r.id} />}
    </li>
  );
};
