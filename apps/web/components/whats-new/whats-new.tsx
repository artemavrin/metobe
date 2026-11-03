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
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

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
/** «И ещё» and an admin's own: the changes with a line of their own. */
type RestId = {
  [K in ChangeId]: Changes[K] extends { line: string } ? K : never;
}[ChangeId];
type FeaturedId = {
  [K in ChangeId]: Changes[K] extends { short: string } ? K : never;
}[ChangeId];

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

/** A small glint: the bullet of a line of «И ещё», the stars' own. */
const Glint = () => (
  <svg
    aria-hidden
    className="text-muted-foreground mt-[6px] size-2 shrink-0"
    viewBox="-8 -8 16 16"
  >
    <path
      d="M0 -7 L1.4 -1.4 L7 0 L1.4 1.4 L0 7 L-1.4 1.4 L-7 0 L-1.4 -1.4 Z"
      fill="currentColor"
    />
  </svg>
);

const Lines = ({ title, ids }: { title: React.ReactNode; ids: RestId[] }) => {
  const t = useTranslations("whatsNew.changes");
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h3 className="text-muted-foreground flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
        {title}
      </h3>
      <ul className="flex flex-col gap-1">
        {ids.map((id) => (
          <li className="flex gap-2 text-sm leading-snug" key={id}>
            <Glint />
            <span title={t(`${id}.text`)}>{t(`${id}.line`)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};

/**
 * The last page's words: «И ещё» a line each — and, for an admin, their own beside it — under the finished chart.
 * Short lines, so the page keeps the others' height and nothing scrolls.
 */
const RestWords = ({ more, admin }: { more: RestId[]; admin: RestId[] }) => {
  const t = useTranslations("whatsNew");
  return (
    <div
      className={cn(
        "animate-in fade-in grid gap-x-6 gap-y-4 px-6 pt-5 pb-4 duration-200",
        EASE,
        more.length > 0 && admin.length > 0 && "sm:grid-cols-2"
      )}
    >
      {more.length > 0 && <Lines ids={more} title={t("more")} />}
      {admin.length > 0 && (
        <Lines
          ids={admin}
          title={
            <>
              {t("admin")}
              <span className="bg-muted rounded px-1.5 py-0.5 text-[10px] tracking-normal normal-case">
                {t("adminBadge")}
              </span>
            </>
          }
        />
      )}
    </div>
  );
};

/**
 * The line between the words and the footer is the tour's progress: full width, unbroken, filled up to the page
 * (scaleX, 300 ms — transform only), as in stories. Over it, a strip of hit areas, one per page, leads to any page.
 */
const Progress = ({
  count,
  page,
  onGo,
}: {
  count: number;
  page: number;
  onGo: (page: number) => void;
}) => {
  const t = useTranslations("whatsNew");
  return (
    <div className="absolute inset-x-0 top-0">
      <div className="bg-border h-px" />
      {/* Filled to the end, it has nothing left to tell: it goes out a moment later, the plain line stays. */}
      <span
        className="bg-primary absolute inset-x-0 -top-px h-0.5 origin-left motion-reduce:transition-none"
        style={{
          opacity: page === count - 1 ? 0 : 1,
          transform: `scaleX(${(page + 1) / count})`,
          transition:
            page === count - 1
              ? "transform 300ms cubic-bezier(0.23, 1, 0.32, 1), opacity 400ms ease 700ms"
              : "transform 300ms cubic-bezier(0.23, 1, 0.32, 1), opacity 150ms ease",
        }}
      />
      <div className="absolute inset-x-0 -top-2 flex h-4">
        {Array.from({ length: count }, (_, i) => (
          <button
            aria-current={i === page ? "step" : undefined}
            aria-label={t("page", { n: i + 1 })}
            className="focus-visible:ring-ring/60 flex-1 outline-none focus-visible:ring-2"
            // oxlint-disable-next-line react/no-array-index-key -- the pages, by number
            key={i}
            onClick={() => onGo(i)}
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
  dir,
}: {
  page: number;
  last: number;
  featured: FeaturedId[];
  dir: 1 | -1;
}) => {
  const t = useTranslations("whatsNew");
  const id = page >= 1 && page < last ? featured[page - 1] : undefined;
  let title = t("introTitle");
  let text = t("intro", { count: featured.length });
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
  const more = note.more as RestId[];
  const forAdmin = admin ? (note.admin as RestId[]) : [];
  const hasRest = more.length + forAdmin.length > 0;
  /** 0 — the cover, 1…n — the changes, then «И ещё» (if any). */
  const last = featured.length + (hasRest ? 1 : 0);
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
    if (i === 0) {
      return (
        <StarCover
          date={note.date}
          onPick={(k) => go(k + 1)}
          seen={seen}
          stars={stars}
          version={note.version}
        />
      );
    }
    return (
      <StarCover
        date={note.date}
        end
        onPick={(k) => go(k + 1)}
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
      <div className="relative shrink-0">
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
              "absolute top-3 right-3 z-20",
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
          {page === last && hasRest ? (
            <RestWords admin={forAdmin} more={more} />
          ) : (
            <Words dir={dir} featured={featured} last={last} page={page} />
          )}
        </div>
      </div>

      <footer className="relative flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 px-6 py-3">
        {/* The progress is the footer's top line: no room of its own, nothing moves it. */}
        <Progress count={last + 1} onGo={go} page={page} />
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
