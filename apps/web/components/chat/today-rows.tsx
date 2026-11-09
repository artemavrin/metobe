"use client";

import type { MemorySuggestion } from "@metobe/contracts/memory";
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
import { toast } from "@metobe/ui/components/sonner";
import { cn } from "@metobe/ui/lib/utils";
import {
  BookUser,
  Building2,
  CalendarClock,
  Check,
  ChevronDown,
  CircleCheck,
  Ellipsis,
  FolderKanban,
  Star,
  X,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import { moveTargets } from "@/lib/memory-dates";

// «На сегодня» on the new chat screen (ARCH §19.6, P17 «Строки»): rows like «Начать с» — what to do and why now on the
// right; a click puts the request into the composer, the person sends it. The menu: done (or confirmed), move the
// deadline, open the card, take it away — each with «Вернуть».

/** The same rows as «Начать с»; on a phone the text wraps and «why» goes under it. */
const ROW =
  "bg-background hover:bg-[color-mix(in_oklab,var(--muted)_70%,var(--background))] flex min-h-11 w-full items-center gap-3 rounded-lg border px-3.5 py-2 pr-10 text-left text-sm transition-[background-color,scale] duration-150 ease-out active:scale-[0.99] motion-reduce:transition-none";
const ENTER =
  "animate-in fade-in slide-in-from-bottom-1 motion-reduce:slide-in-from-bottom-0 fill-mode-both duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]";
/** Seen at once; the rest behind «Ещё N». */
const FIRST = 3;

type Item = MemorySuggestion;

const send = (url: string, method: string, body?: object) =>
  fetch(url, {
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "content-type": "application/json" } : undefined,
    method,
  });

const Face = ({ who }: { who: Item["who"] }) => {
  let face: React.ReactNode = <BookUser className="size-3" />;
  if (who?.kind === "org") {
    face = <Building2 className="size-3" />;
  } else if (who?.kind === "project") {
    face = <FolderKanban className="size-3" />;
  } else if (who) {
    face = who.name
      .replaceAll(/[«»"]/gu, "")
      .split(/\s+/u)
      .map((w) => w[0])
      .slice(0, 2)
      .join("");
  }
  return (
    <span
      aria-hidden
      className="bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-[9px] font-medium"
    >
      {face}
    </span>
  );
};

const normalize = (s: string) => s.toLocaleLowerCase("ru").replaceAll("ё", "е");

/**
 * The row's words: the commitment as recorded, with the other side in front when the text does not name them
 * («ООО «Вектор»: Ответить на коммерческое предложение»). A name counts as said by any word of it, declined.
 */
const labelOf = (s: Item) => {
  if (!s.who) {
    return s.text;
  }
  const text = normalize(s.text);
  const said = normalize(s.who.name)
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((w) => w.length >= 4)
    .some((w) => text.includes(w.slice(0, Math.max(4, w.length - 2))));
  return said ? s.text : `${s.who.name}: ${s.text}`;
};

/** The request that goes into the composer: «Кому: …» — no name has to be declined. */
const usePrompt = (timeZone: string) => {
  const t = useTranslations("memory.forToday");
  const format = useFormatter();
  return (s: Item) => {
    const due = s.dueAt
      ? format.dateTime(new Date(s.dueAt), {
          day: "numeric",
          month: "long",
          timeZone,
        })
      : null;
    const name = s.who?.name ?? null;
    if (s.status === "unconfirmed") {
      return t("askConfirm", { name: name ?? "—", text: s.text });
    }
    if (s.side === "mine") {
      return t("askMine", { due: due ?? "none", text: s.text });
    }
    return t("askRemind", {
      due: due ?? "none",
      late: s.reason === "overdue" ? "yes" : "no",
      name: name ?? "—",
      text: s.text,
    });
  };
};

/** Why now, on the right: «просрочено на 3 дн.», «ждёт проверки», «сегодня», «завтра», «важно». */
const Why = ({ s }: { s: Item }) => {
  const t = useTranslations("memory.forToday");
  return (
    <span
      className={cn(
        "text-muted-foreground shrink-0 text-xs max-sm:shrink",
        s.reason === "overdue" && "text-warning-foreground dark:text-warning"
      )}
    >
      {s.important && (
        <Star className="fill-warning text-warning me-1 inline size-3 -translate-y-px" />
      )}
      {t(`why.${s.reason}`, { days: s.days })}
    </span>
  );
};

const Menu = ({
  s,
  timeZone,
  onGone,
  onBack,
}: {
  s: Item;
  timeZone: string;
  onGone: () => void;
  onBack: () => void;
}) => {
  const t = useTranslations("memory");
  const today = useTranslations("memory.forToday");
  const targets = moveTargets(new Date(), timeZone);
  const said = s.status === "unconfirmed";
  const act = async (
    run: () => Promise<Response>,
    done: string,
    undo?: () => Promise<Response>
  ) => {
    onGone();
    const response = await run();
    if (!response.ok) {
      onBack();
      toast.error(t("failed"));
      return;
    }
    toast(done, {
      action: undo
        ? {
            label: t("restore"),
            onClick: async () => {
              const back = await undo();
              if (back.ok) {
                onBack();
              }
            },
          }
        : undefined,
    });
  };
  const record = `/api/memory/records/${s.id}`;
  const move = (at: Date) =>
    act(
      () => send(record, "PATCH", { dueAt: at.toISOString() }),
      t("savedMoved"),
      () => send(record, "PATCH", { dueAt: s.dueAt })
    );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={t("more")}
            className="absolute top-1/2 right-2 -translate-y-1/2 opacity-60 group-hover:opacity-100 aria-expanded:opacity-100"
            size="icon-xs"
            variant="ghost"
          />
        }
      >
        <Ellipsis />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem
          onClick={() =>
            act(
              () => send(record, "PATCH", { status: "done" }),
              said ? t("savedConfirmed") : t("savedDone"),
              () => send(record, "PATCH", { status: s.status })
            )
          }
        >
          {said ? <CircleCheck /> : <Check />}{" "}
          {said ? t("confirm") : today("done")}
        </DropdownMenuItem>
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
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {s.who && (
          <DropdownMenuItem render={<Link href={`/memory?card=${s.who.id}`} />}>
            <BookUser /> {today("open")}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() =>
            act(
              () => send(`${record}/dismiss`, "POST"),
              today("dismissed"),
              () => send(`${record}/dismiss`, "DELETE")
            )
          }
        >
          <X /> {today("dismiss")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/** The section, or nothing once every row is gone. `put` — the composer takes the request. */
export const TodayRows = ({
  items,
  timeZone,
  put,
}: {
  items: Item[];
  timeZone: string;
  put: (text: string) => void;
}) => {
  const t = useTranslations("memory.forToday");
  const prompt = usePrompt(timeZone);
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [all, setAll] = useState(false);
  const left = items.filter((s) => !gone.has(s.id));
  if (left.length === 0) {
    return null;
  }
  const shown = all ? left : left.slice(0, FIRST);
  const more = left.length - shown.length;
  const hide = (id: string) => setGone((g) => new Set(g).add(id));
  const show = (id: string) =>
    setGone((g) => {
      const next = new Set(g);
      next.delete(id);
      return next;
    });
  return (
    <section>
      <h2 className="text-muted-foreground mb-2 text-xs font-medium">
        {t("title")}
      </h2>
      <div className="flex flex-col gap-2">
        {shown.map((s) => (
          <div className={cn("group relative", ENTER)} key={s.id}>
            <button
              className={ROW}
              onClick={() => put(prompt(s))}
              type="button"
            >
              <Face who={s.who} />
              <span className="flex min-w-0 flex-1 items-center gap-3 max-sm:flex-col max-sm:items-start max-sm:gap-0.5">
                <span className="min-w-0 flex-1 sm:truncate">{labelOf(s)}</span>
                <Why s={s} />
              </span>
            </button>
            <Menu
              onBack={() => show(s.id)}
              onGone={() => hide(s.id)}
              s={s}
              timeZone={timeZone}
            />
          </div>
        ))}
        {more > 0 && (
          <button
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 self-start px-1 text-xs transition-colors duration-150"
            onClick={() => setAll(true)}
            type="button"
          >
            <ChevronDown className="size-3.5" /> {t("more", { count: more })}
          </button>
        )}
      </div>
    </section>
  );
};
