"use client";

import type {
  MemoryCard,
  MemoryCardItem,
  MemoryRecordView,
} from "@metobe/contracts/memory";
import { Button } from "@metobe/ui/components/button";
import { cn } from "@metobe/ui/lib/utils";
import {
  Box,
  Building2,
  CalendarClock,
  FolderKanban,
  Users,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";

import { daysUntil } from "@/lib/memory-dates";

import { MemoryRecordRow, PRESS } from "./memory-record";

// The parts of a card that the «Память» page and an answer in the chat draw the same way (P22): the face, a section,
// «что сейчас», «Баланс».

export const Avatar = ({
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

export const Section = ({
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

/** Open commitments: «важно» first, then the nearest deadline, those without one last. */
export const byUrgency = (a: MemoryRecordView, b: MemoryRecordView) =>
  Number(b.important) - Number(a.important) ||
  (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999") ||
  b.recordedAt.localeCompare(a.recordedAt);

/**
 * «Что сейчас» (P22): three figures in a row instead of a paragraph — the last contact, how often a rule wants one,
 * what is open and past its day. Lines, not a panel. Longer without contact than the rule wants — the warning colour.
 */
export const Now = ({
  data,
  timeZone,
}: {
  data: MemoryCard;
  timeZone: string;
}) => {
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

/** «Ждёте» and «Вы обещали» side by side (P22 «Баланс»); nothing when neither has anything open. */
export const Balance = ({
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
export const debtorOf = (r: MemoryRecordView) =>
  r.entities.find((e) => e.role === "debtor");

/**
 * «Баланс» (P22): what they owe and what you owe, apart; promises between others — and every promise on a group's or
 * a project's card — stay one list.
 */
export const sidesOf = (card: MemoryCardItem, open: MemoryRecordView[]) => {
  const split = card.kind === "person" || card.kind === "org";
  const theirs = split ? open.filter((r) => debtorOf(r)?.id === card.id) : [];
  const mine = split ? open.filter((r) => debtorOf(r)?.kind === "self") : [];
  const others = open.filter((r) => !(theirs.includes(r) || mine.includes(r)));
  return { mine, others, split, theirs };
};

/**
 * How each side kept its promises (Г2.2): plain counts under «что сейчас», nothing when fewer than three promises with
 * a deadline are done. «Отмечено в срок» — the day it was said, not the day it was done.
 */
export const Reliability = ({ data }: { data: MemoryCard }) => {
  const t = useTranslations("memory");
  const { reliability } = data;
  if (!(reliability?.theirs || reliability?.mine)) {
    return null;
  }
  const line = (
    key: "reliabilityTheirs" | "reliabilityMine",
    s: NonNullable<MemoryCard["reliability"]>["theirs"]
  ) =>
    s ? (
      <p className="text-muted-foreground text-sm" key={key}>
        {t(key, {
          days: s.lateDays,
          late: s.late,
          moved: s.moved,
          onTime: s.onTime,
          overdueOpen: s.overdueOpen,
          total: s.total,
        })}
      </p>
    ) : null;
  return (
    <div className="flex flex-col gap-1">
      {line("reliabilityTheirs", reliability.theirs)}
      {line("reliabilityMine", reliability.mine)}
    </div>
  );
};

/**
 * The card's «Кратко» (Г2.1): who they are, how to talk to them, what matters now — three short lists the memory model
 * wrote from the card's records. Shown only when there is something; while the model writes one, the page looks again in
 * a few seconds (`onBuilding`).
 */
export const Summary = ({ data }: { data: MemoryCard }) => {
  const t = useTranslations("memory");
  const format = useFormatter();
  const { summary } = data;
  if (!summary) {
    return null;
  }
  const lists = [
    ["who", summary.who],
    ["how", summary.how],
    ["now", summary.now],
  ] as const;
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium">{t("summary")}</h3>
        <span className="text-muted-foreground text-xs">
          {t("summaryBuilt", {
            date: format.dateTime(new Date(summary.builtAt), {
              day: "numeric",
              month: "short",
            }),
          })}
        </span>
      </div>
      <dl className="flex flex-col gap-2">
        {lists.map(([key, lines]) =>
          lines.length > 0 ? (
            <div
              className="grid grid-cols-[7.5rem_1fr] gap-3 max-sm:grid-cols-1 max-sm:gap-0.5"
              key={key}
            >
              <dt className="text-muted-foreground text-sm">
                {t(`summary_${key}`)}
              </dt>
              <dd className="text-sm">{lines.map((l) => l.text).join(" ")}</dd>
            </div>
          ) : null
        )}
      </dl>
    </section>
  );
};

/** «Перед встречей» (Г2.1): a new chat with the request in its composer; the chat's model answers from the card. */
export const MeetingButton = ({ card }: { card: MemoryCardItem }) => {
  const t = useTranslations("memory");
  if (card.kind !== "person" && card.kind !== "org") {
    return null;
  }
  return (
    <Button
      className={PRESS}
      nativeButton={false}
      render={
        <Link
          href={`/?say=${encodeURIComponent(t("meetingAsk", { name: card.name }))}`}
        />
      }
      size="sm"
      variant="outline"
    >
      <CalendarClock /> <span className="max-sm:sr-only">{t("meeting")}</span>
    </Button>
  );
};
