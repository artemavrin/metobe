"use client";

import { Button } from "@metobe/ui/components/button";
import { cn } from "@metobe/ui/lib/utils";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { StarCover } from "./constellation";

import type { Change } from "./data";
import { CloseOnCover, DontShow, EASE, Stage, WhatsNewDialog } from "./parts";
import { useChanges, useProto } from "./state";

// Round 2: the «Тур» the user picked — a change per page, the cover first, «И ещё» last, dots, ←/→, «Не показывать
// после обновлений» — with the screenshot's place given to whatever the variant shows there. The stage is one height
// on every page, so the words and the buttons under it never jump. The stages sit on one strip that slides toward
// the page asked for (spatial: «Далее» is to the right) — a transition, so a quick ←←→ retargets instead of
// restarting. A page's stage is mounted the first time it is reached and kept, so the cover's lines draw once and a
// demo does not grab the focus before its turn.

export const FEATURED = ["share", "ask", "map", "welcome"];

/** More than a line's worth left under the fold. */
const hasBelow = (el: HTMLElement) => el.scrollHeight - el.scrollTop - el.clientHeight > 8;

/** «Ещё ниже»: the page goes on under the fold — a chip at its foot; a click scrolls on, at the end it goes. */
const MoreBelow = ({ shown, onClick }: { shown: boolean; onClick: () => void }) => (
  <button
    aria-hidden={!shown}
    className={cn(
      "absolute right-4 bottom-3 flex items-center bg-white/10 text-white/80 ring-white/20 backdrop-blur-sm hover:bg-white/15 hover:text-white gap-1 rounded-full px-2.5 py-1 text-xs shadow-sm ring-1 transition-[opacity,transform,color] duration-200",
      EASE,
      shown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1 opacity-0"
    )}
    onClick={onClick}
    tabIndex={shown ? 0 : -1}
    type="button"
  >
    Ещё ниже <ChevronDown className="size-3.5" />
  </button>
);

/** A tiny glint: the bullet of a line on the night sky. */
const Glint = () => (
  <svg aria-hidden className="mt-[7px] size-2 shrink-0 opacity-70" viewBox="-8 -8 16 16">
    <path d="M0 -7 L1.4 -1.4 L7 0 L1.4 1.4 L0 7 L-1.4 1.4 L-7 0 L-1.4 -1.4 Z" fill="white" />
  </svg>
);

const NightLine = ({ c, i }: { c: Change; i: number }) => (
  <li className="cs-rise flex gap-2.5 text-sm leading-relaxed text-white/65" style={{ animationDelay: `${700 + i * 70}ms` }}>
    <Glint />
    <span>
      <span className="font-medium text-white">{c.title}.</span> {c.text}
    </span>
  </li>
);

/**
 * The last page: the cover's sky again, the chart finished — every star lit, smaller, in the corner, its lines drawn
 * once more — and «И ещё» (an admin's own after it) on the same night, a glint for a bullet. Scrolls only when it
 * must, and then says so.
 */
const RestStage = ({ changes, stars }: { changes: Change[]; stars: Change[] }) => {
  const box = useRef<HTMLDivElement>(null);
  const [below, setBelow] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setBelow(hasBelow(el));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of el.children) observer.observe(child);
    return () => observer.disconnect();
  }, []);
  const more = changes.filter((c) => !c.shot && !c.admin);
  const admin = changes.filter((c) => c.admin);
  let n = 0;
  return (
    <StarCover
      changes={stars}
      end
      onPick={() => undefined}
      seen={new Set()}
      rest={
        <div className="relative h-full">
          <div
            className="h-full overflow-y-auto overscroll-contain px-7 pb-6 [mask-image:linear-gradient(to_bottom,black_calc(100%-2rem),transparent)] [scrollbar-width:none]"
            onScroll={(e) => setBelow(hasBelow(e.currentTarget))}
            ref={box}
          >
            <div className="flex flex-col gap-4">
              {more.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h3 className="cs-rise text-xs font-medium tracking-[0.18em] text-white/50 uppercase" style={{ animationDelay: "600ms" }}>
                    И ещё
                  </h3>
                  <ul className="flex flex-col gap-1.5">
                    {more.map((c) => (
                      <NightLine c={c} i={n++} key={c.id} />
                    ))}
                  </ul>
                </section>
              )}
              {admin.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h3 className="cs-rise flex items-center gap-2 text-xs font-medium tracking-[0.18em] text-white/50 uppercase" style={{ animationDelay: `${700 + n * 70}ms` }}>
                    Для администратора
                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] tracking-normal text-white/70 normal-case">видите только вы</span>
                  </h3>
                  <ul className="flex flex-col gap-1.5">
                    {admin.map((c) => (
                      <NightLine c={c} i={n++} key={c.id} />
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </div>
          <MoreBelow onClick={() => box.current?.scrollBy({ behavior: "smooth", top: 120 })} shown={below} />
        </div>
      }
    />
  );
};

const NUMBERS = ["", "Одно", "Два", "Три", "Четыре", "Пять", "Шесть"];

export const TourShell = ({
  media,
  hint,
  dark,
  intro,
}: {
  /** What stands on the stage for a change; `active` — its page is the one shown. */
  media: (change: Change, active: boolean) => ReactNode;
  /** The cover's second sentence: how to use the stages of this variant. */
  intro?: string;
  /** A line under the change's words: what to do with the stage. */
  hint?: (change: Change) => ReactNode;
  /** The stage is dark (a drawing on the night): the close button goes white. */
  dark?: boolean;
}) => {
  const changes = useChanges();
  const { setOpen, stars } = useProto();
  const shown = FEATURED.map((id) => changes.find((c) => c.id === id)).filter((c): c is Change => Boolean(c));
  const last = shown.length + 1;
  const [page, setPage] = useState(0);
  const nextButton = useRef<HTMLButtonElement>(null);

  const [dir, setDir] = useState<1 | -1>(1);
  /** Pages reached so far: their stages stay mounted, their stars stay lit. */
  const [reached, setReached] = useState<Set<number>>(() => new Set([0]));
  const go = (to: number) => {
    const next = Math.max(0, Math.min(last, to));
    if (next === page) return;
    setDir(next > page ? 1 : -1);
    setPage(next);
    setReached((r) => (r.has(next) ? r : new Set(r).add(next)));
  };
  const seen = new Set([...reached].filter((p) => p >= 1 && p <= shown.length).map((p) => p - 1));
  const count = `${NUMBERS[shown.length] ?? shown.length} ${shown.length === 1 ? "заметное изменение" : shown.length < 5 ? "заметных изменения" : "заметных изменений"}`;
  // «Звёзд на обложке» (a knob): the cover drawn with fewer or more big changes; the tour's own come first.
  const sky = stars === null ? shown : [...shown, ...changes.filter((c) => !shown.includes(c) && !c.admin)].slice(0, stars);
  const change = page >= 1 && page <= shown.length ? shown[page - 1] : null;

  return (
    <Stage>
      <WhatsNewDialog className="sm:max-w-[600px]" initialFocus={nextButton}>
        <div
          className="flex min-h-0 flex-col"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") go(page + 1);
            if (e.key === "ArrowLeft") go(page - 1);
          }}
          role="presentation"
        >
          <div className="relative h-[22rem] shrink-0 overflow-clip border-b">
            <div
              className={cn("flex h-full transition-transform duration-300 motion-reduce:transition-none", EASE)}
              style={{ transform: `translateX(${-page * 100}%)` }}
            >
              {Array.from({ length: last + 1 }, (_, i) => {
                const c = i >= 1 && i <= shown.length ? shown[i - 1] : null;
                return (
                  <div aria-hidden={i !== page} className="h-full w-full shrink-0" inert={i !== page} key={c?.id ?? i}>
                    {reached.has(i) &&
                      (c ? (
                        media(c, i === page)
                      ) : i === last ? (
                        <RestStage changes={changes} stars={sky} />
                      ) : (
                        <StarCover changes={sky} onPick={(k) => k < shown.length && go(k + 1)} seen={seen} />
                      ))}
                  </div>
                );
              })}
            </div>
            <CloseOnCover className={change && !dark ? "text-muted-foreground hover:bg-muted hover:text-foreground" : undefined} />
          </div>

          {/* One height on every page: the window never jumps. */}
          <div className="h-[12rem] shrink-0 sm:h-[9.5rem] overflow-y-auto overscroll-contain">
            <div
              className={cn(
                "animate-in fade-in flex flex-col gap-1.5 px-6 pt-5 pb-4 duration-200 motion-reduce:slide-in-from-left-0 motion-reduce:slide-in-from-right-0",
                dir === 1 ? "slide-in-from-right-2" : "slide-in-from-left-2",
                EASE
              )}
              key={page}
            >
              {page === 0 && (
                <>
                  <h2 className="text-lg font-semibold">Metobe обновился</h2>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {count} и несколько мелочей в конце.{intro ? ` ${intro}` : ""}
                  </p>
                </>
              )}
              {change && (
                <>
                  <h2 className="text-lg font-semibold">{change.title}</h2>
                  <p className="text-muted-foreground text-sm leading-relaxed">{change.text}</p>
                  {hint?.(change)}
                </>
              )}
              {page === last && (
                <>
                  <h2 className="text-lg font-semibold">Вот и всё</h2>
                  <p className="text-muted-foreground text-sm leading-relaxed">Перечитать можно в любой момент: меню аккаунта → «Что нового».</p>
                </>
              )}
            </div>
          </div>

          <footer className="relative flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 px-6 py-3">
            {/* The line between the words and the footer is the progress: full width, unbroken, filled up to the page. */}
            <div className="absolute inset-x-0 top-0 -translate-y-1/2">
              <div className="bg-border relative h-0.5 overflow-hidden">
                <span className={cn("bg-foreground absolute inset-0 origin-left transition-transform duration-300 motion-reduce:transition-none", EASE)} style={{ transform: `scaleX(${(page + 1) / (last + 1)})` }} />
              </div>
              <div className="absolute inset-x-0 -top-2 flex h-4">
                {Array.from({ length: last + 1 }, (_, i) => (
                  <button aria-current={i === page ? "step" : undefined} aria-label={`Страница ${i + 1}`} className="flex-1 outline-none" key={i} onClick={() => go(i)} type="button" />
                ))}
              </div>
            </div>
            <DontShow />
            <div className="ml-auto flex items-center gap-2">
              
              {/* Always there, unseen on the cover: the dots and «Далее» never move when it comes. */}
              <Button
                aria-hidden={page === 0}
                className={cn(page === 0 && "invisible")}
                onClick={() => go(page - 1)}
                tabIndex={page === 0 ? -1 : undefined}
                variant="ghost"
              >
                Назад
              </Button>
              {page < last ? <Button className="min-w-24" onClick={() => go(page + 1)} ref={nextButton}>Далее</Button> : <Button className="min-w-24" onClick={() => setOpen(false)}>Понятно</Button>}
            </div>
          </footer>
        </div>
      </WhatsNewDialog>
    </Stage>
  );
};
