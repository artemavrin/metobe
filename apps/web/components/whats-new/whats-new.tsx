"use client";

import type { ReleaseNote } from "@metobe/core/whats-new-notes";
import type { Messages } from "@metobe/i18n/messages";
import { Button } from "@metobe/ui/components/button";
import { Checkbox } from "@metobe/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@metobe/ui/components/dialog";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowRight, ChevronDown, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { closeWhatsNewAction } from "@/app/(app)/(chat)/actions";
import { AutoDemo, LiveDemo } from "@/components/whats-new/autoplay";
import { DEMOS } from "@/components/whats-new/demos";
import { StarCover } from "@/components/whats-new/star-cover";

// «Что нового» (docs/RELEASE.md; prototype /dev/prototypes/whats-new, «Смотреть»): a window over the chat after an
// update, one big change per page — a star chart of them on the cover, each page a live demo the cursor plays, «И
// ещё» last — then «Понятно». One height on every page: the window never jumps. The stages sit on one strip that
// slides toward the page asked for (a transition: a quick ←←→ retargets); a stage is mounted the first time its page
// is reached and kept, so the cover draws once and a demo does not take the focus before its turn.

type Changes = Messages["whatsNew"]["changes"];
type ChangeId = keyof Changes;
type FeaturedId = {
  [K in ChangeId]: Changes[K] extends { short: string } ? K : never;
}[ChangeId];

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

/** More than a line's worth left under the fold. */
const hasBelow = (el: HTMLElement) =>
  el.scrollHeight - el.scrollTop - el.clientHeight > 8;

/** A tiny glint: the bullet of a line on the night sky. */
const Glint = () => (
  <svg
    aria-hidden
    className="mt-[7px] size-2 shrink-0 opacity-70"
    viewBox="-8 -8 16 16"
  >
    <path
      d="M0 -7 L1.4 -1.4 L7 0 L1.4 1.4 L0 7 L-1.4 1.4 L-7 0 L-1.4 -1.4 Z"
      fill="white"
    />
  </svg>
);

/** A change in one run of text on the night: its name, then what it does; the lines come in one after another. */
const Line = ({ id, order }: { id: ChangeId; order: number }) => {
  const t = useTranslations("whatsNew.changes");
  return (
    <li
      className="cs-rise flex gap-2.5 text-sm leading-relaxed text-white/65"
      style={{ animationDelay: `${700 + order * 70}ms` }}
    >
      <Glint />
      <span>
        <span className="font-medium text-white">{t(`${id}.title`)}.</span>{" "}
        {t(`${id}.text`)}
      </span>
    </li>
  );
};

const Heading = ({
  children,
  delay,
}: {
  children: React.ReactNode;
  delay: number;
}) => (
  <h3
    className="cs-rise flex items-center gap-2 text-xs font-medium tracking-[0.18em] text-white/50 uppercase"
    style={{ animationDelay: `${delay}ms` }}
  >
    {children}
  </h3>
);

/** «Ещё ниже»: the list goes on under the fold — a chip in the corner; a click scrolls on, at the end it goes. */
const MoreBelow = ({
  shown,
  onClick,
}: {
  shown: boolean;
  onClick: () => void;
}) => {
  const t = useTranslations("whatsNew");
  return (
    <button
      aria-hidden={!shown}
      className={cn(
        "absolute right-4 bottom-3 flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/80 ring-1 ring-white/20 backdrop-blur-sm transition-[opacity,transform,color,background-color] duration-200 hover:bg-white/15 hover:text-white",
        EASE,
        shown
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-1 opacity-0"
      )}
      onClick={onClick}
      tabIndex={shown ? 0 : -1}
      type="button"
    >
      {t("moreBelow")} <ChevronDown className="size-3.5" />
    </button>
  );
};

/**
 * The last page's stage: the cover's sky again with the chart finished — every star lit, smaller, in the corner,
 * its lines drawn once more — and «И ещё» (an admin's own after it) on the same night. Scrolls only when it must,
 * and then says so.
 */
const RestList = ({ more, admin }: { more: ChangeId[]; admin: ChangeId[] }) => {
  const t = useTranslations("whatsNew");
  const box = useRef<HTMLDivElement>(null);
  const [below, setBelow] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) {
      return;
    }
    const measure = () => setBelow(hasBelow(el));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="relative h-full">
      <div
        className="h-full [scrollbar-width:none] overflow-y-auto overscroll-contain [mask-image:linear-gradient(to_bottom,black_calc(100%-2rem),transparent)] px-7 pb-6"
        onScroll={(e) => setBelow(hasBelow(e.currentTarget))}
        ref={box}
      >
        <div className="flex flex-col gap-4">
          {more.length > 0 && (
            <section className="flex flex-col gap-2">
              <Heading delay={600}>{t("more")}</Heading>
              <ul className="flex flex-col gap-1.5">
                {more.map((id, i) => (
                  <Line id={id} key={id} order={i} />
                ))}
              </ul>
            </section>
          )}
          {admin.length > 0 && (
            <section className="flex flex-col gap-2">
              <Heading delay={700 + more.length * 70}>
                {t("admin")}
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] tracking-normal text-white/70 normal-case">
                  {t("adminBadge")}
                </span>
              </Heading>
              <ul className="flex flex-col gap-1.5">
                {admin.map((id, i) => (
                  <Line id={id} key={id} order={more.length + i} />
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
      <MoreBelow
        onClick={() => box.current?.scrollBy({ behavior: "smooth", top: 120 })}
        shown={below}
      />
    </div>
  );
};

/**
 * The line between the words and the footer is the tour's progress: the cover is not a step, the changes and the end
 * are — so the last change leaves a bit to go; on the end itself the line is not shown, nothing is left to track.
 * Full width, unbroken, in the brand's color, filled up to the page (scaleX, 300 ms — transform only), as in
 * stories. Over it, a hit area per step leads to it.
 */
const Progress = ({
  steps,
  page,
  onGo,
}: {
  /** The pages after the cover: 1…steps, the last one the end. */
  steps: number;
  page: number;
  onGo: (page: number) => void;
}) => {
  const t = useTranslations("whatsNew");
  return (
    <div className="absolute inset-x-0 top-0">
      <div className="bg-border h-px" />
      <span
        className={cn(
          "bg-primary absolute inset-x-0 -top-px h-0.5 origin-left transition-[transform,opacity] duration-300 motion-reduce:transition-none",
          EASE,
          page >= steps ? "opacity-0" : "opacity-100"
        )}
        style={{ transform: `scaleX(${Math.min(page, steps) / steps})` }}
      />
      <div className="absolute inset-x-0 -top-2 flex h-4">
        {Array.from({ length: steps }, (_, i) => (
          <button
            aria-current={i + 1 === page ? "step" : undefined}
            aria-label={t("page", { n: i + 1 })}
            className="focus-visible:ring-ring/60 flex-1 outline-none focus-visible:ring-2"
            // oxlint-disable-next-line react/no-array-index-key -- the changes, by number
            key={i}
            onClick={() => onGo(i + 1)}
            type="button"
          />
        ))}
      </div>
    </div>
  );
};

/** The words under the stage: the cover's, a change's, or the last page's. */
const Words = ({
  page,
  last,
  featured,
  hasRest,
  dir,
  onHistory,
}: {
  page: number;
  last: number;
  featured: FeaturedId[];
  /** Whether the end page lists «И ещё» or an admin's changes. */
  hasRest: boolean;
  dir: 1 | -1;
  /** «Все изменения по версиям»: the window closes, the history page opens. */
  onHistory: () => void;
}) => {
  const t = useTranslations("whatsNew");
  const id = page >= 1 && page < last ? featured[page - 1] : undefined;
  let title = t("introTitle");
  let text = t("intro", {
    count: featured.length,
    rest: hasRest ? "yes" : "no",
  });
  if (id) {
    title = t(`changes.${id}.title`);
    text = t(`changes.${id}.text`);
  } else if (page === last) {
    title = t("doneTitle");
    text = t("doneText");
  }
  return (
    <div
      className={cn(
        "animate-in fade-in motion-reduce:slide-in-from-left-0 motion-reduce:slide-in-from-right-0 flex flex-col gap-1.5 px-6 pt-5 pb-4 duration-200",
        dir === 1 ? "slide-in-from-right-2" : "slide-in-from-left-2",
        EASE
      )}
      key={page}
    >
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-muted-foreground text-sm leading-relaxed">{text}</p>
      {/* Only the newest version is in the window; every one before it, in full, is a click away. */}
      {page === last && (
        <Button
          className="mt-2 self-start"
          nativeButton={false}
          render={<Link href="/whats-new" onClick={onHistory} />}
          size="sm"
          variant="outline"
        >
          {t("historyLink")} <ArrowRight />
        </Button>
      )}
    </div>
  );
};

const Tour = ({
  note,
  admin,
  onDone,
}: {
  note: ReleaseNote;
  admin: boolean;
  onDone: (off: boolean) => void;
}) => {
  const t = useTranslations("whatsNew");
  const featured = note.featured.filter((id): id is FeaturedId => id in DEMOS);
  const more = note.more as ChangeId[];
  const forAdmin = admin ? (note.admin as ChangeId[]) : [];
  const hasRest = more.length + forAdmin.length > 0;
  /** 0 — the cover, 1…n — the changes, then the end: «И ещё» when there is any, else the finished chart alone. */
  const last = featured.length + 1;
  const [page, setPage] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [off, setOff] = useState(false);
  /** Pages reached so far: their stages stay mounted, their stars stay lit. */
  const [reached, setReached] = useState<Set<number>>(() => new Set([0]));
  const go = (to: number) => {
    const next = Math.max(0, Math.min(last, to));
    if (next === page) {
      return;
    }
    setDir(next > page ? 1 : -1);
    setPage(next);
    setReached((r) => (r.has(next) ? r : new Set(r).add(next)));
  };
  const seen = new Set(
    [...reached].filter((p) => p >= 1 && p <= featured.length).map((p) => p - 1)
  );
  const stars = featured.map((f) => ({
    id: f,
    short: t(`changes.${f}.short`),
    title: t(`changes.${f}.title`),
  }));
  const onDemo = page >= 1 && page <= featured.length;

  const stageOf = (i: number) => {
    const id = i >= 1 && i <= featured.length ? featured[i - 1] : undefined;
    if (id) {
      return id === "greeting" ? (
        <LiveDemo id={id} />
      ) : (
        <AutoDemo active={i === page} id={id} />
      );
    }
    return (
      <StarCover
        date={note.date}
        onPick={(k) => go(k + 1)}
        rest={i === 0 ? undefined : <RestList admin={forAdmin} more={more} />}
        seen={seen}
        stars={stars}
        version={note.version}
      />
    );
  };

  return (
    <div
      className="flex min-h-0 flex-col"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") {
          go(page + 1);
        }
        if (e.key === "ArrowLeft") {
          go(page - 1);
        }
      }}
      role="presentation"
    >
      <div className="relative h-[22rem] shrink-0 overflow-clip border-b">
        <div
          className={cn(
            "flex h-full transition-transform duration-300 motion-reduce:transition-none",
            EASE
          )}
          style={{ transform: `translateX(${-page * 100}%)` }}
        >
          {Array.from({ length: last + 1 }, (_, i) => (
            <div
              aria-hidden={i !== page}
              className="h-full w-full shrink-0"
              inert={i !== page}
              // oxlint-disable-next-line react/no-array-index-key -- a page's stage, by its number
              key={i}
            >
              {reached.has(i) && stageOf(i)}
            </div>
          ))}
        </div>
        <Button
          aria-label={t("close")}
          className={cn(
            "absolute top-3 right-3 z-10",
            onDemo
              ? "text-muted-foreground hover:bg-muted hover:text-foreground"
              : "text-white/70 hover:bg-white/10 hover:text-white"
          )}
          onClick={() => onDone(off)}
          size="icon-sm"
          variant="ghost"
        >
          <X />
        </Button>
      </div>

      <div className="h-[12rem] shrink-0 overflow-y-auto overscroll-contain sm:h-[9.5rem]">
        <Words
          dir={dir}
          featured={featured}
          hasRest={hasRest}
          last={last}
          onHistory={() => onDone(off)}
          page={page}
        />
      </div>

      <footer className="relative flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 px-6 py-3">
        {/* The progress is the footer's top line: no room of its own, nothing moves it. */}
        <Progress onGo={go} page={page} steps={last} />
        {/* oxlint-disable-next-line jsx-a11y/label-has-associated-control -- the checkbox inside is the control */}
        <label className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-2 text-sm whitespace-nowrap transition-colors duration-150 select-none">
          <Checkbox checked={off} onCheckedChange={(v) => setOff(Boolean(v))} />
          {t("dontShow")}
        </label>
        <div className="ml-auto flex items-center gap-2">
          {/* Always there, unseen on the cover: the dots and «Далее» never move when it comes. */}
          <Button
            aria-hidden={page === 0}
            className={cn(page === 0 && "invisible")}
            onClick={() => go(page - 1)}
            tabIndex={page === 0 ? -1 : undefined}
            variant="ghost"
          >
            {t("back")}
          </Button>
          {page < last ? (
            <Button autoFocus className="min-w-24" onClick={() => go(page + 1)}>
              {t("next")}
            </Button>
          ) : (
            <Button className="min-w-24" onClick={() => onDone(off)}>
              {t("done")}
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
};

/**
 * The window: open by itself after an update (`note` past what was seen), or from the account menu. Closing it in
 * any way marks the version as seen, with «Не показывать после обновлений» as ticked.
 */
export const WhatsNewDialog = ({
  note,
  admin,
  open,
  onOpenChange,
}: {
  note: ReleaseNote;
  admin: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const t = useTranslations("whatsNew");
  const [round, setRound] = useState(0);
  const offRef = useRef(false);
  const done = (off: boolean) => {
    offRef.current = off;
    onOpenChange(false);
  };
  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) {
          // Marked seen in the background; a failure only means it opens once more.
          closeWhatsNewAction(note.version, offRef.current);
          offRef.current = false;
          // Opened again from the menu, it starts from the cover.
          setRound((r) => r + 1);
        }
        onOpenChange(next);
      }}
      open={open}
    >
      <DialogContent
        className={cn(
          "data-open:zoom-in-[0.96] flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 duration-200 sm:max-w-[600px]",
          EASE
        )}
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">
          {t("brand", { version: `v${note.version}` })}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t("description")}
        </DialogDescription>
        <Tour admin={admin} key={round} note={note} onDone={done} />
      </DialogContent>
    </Dialog>
  );
};
