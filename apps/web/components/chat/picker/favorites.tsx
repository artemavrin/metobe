"use client";

// Round 4 «Щелчок»: what opens from the model chip (spec §5, keys §6, motion §7 #3, #12, #14–#17). No text field:
// the list itself holds focus. Row 0 is the way into the palette (so are ⌘/ and any letter), then the user's
// favorites under the digits 1–9. The star or ⌘D un-stars softly — the row stays, dimmed, until the picker closes.
// The grip or ⌥↑/⌥↓ reorder, and the digits follow. Which rows exist is frozen at open: starring never moves a row.
import { Kbd } from "@metobe/ui/components/kbd";
import { cn } from "@metobe/ui/lib/utils";
import { Check, GripVertical, LayoutGrid } from "lucide-react";
import {
  motion,
  Reorder,
  useDragControls,
  useReducedMotion,
} from "motion/react";
import { useTranslations } from "next-intl";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { BrandLogo } from "@/components/brand-logo";

import { usePickerData } from "./data";
import type { Favorites, PickerModel } from "./data";
import {
  EASE_OUT,
  EASE_OUT_CSS,
  popStar,
  SNAP,
  SPRING_REFLOW,
  StarToggle,
  useListHighlight,
} from "./motion";
import type { NavSource } from "./motion";
import { PEEK_CSS, PeekCard } from "./peek";

/** Key of row 0, the way into the palette. Model ids never look like this. */
const ENTRY = "#entry";

/**
 * The drop settles like SPRING_DRAG (0.5 s, bounce 0.2). Reorder snaps back through the inertia's boundary spring
 * (`dragTransition`), not through `transition`, so the same spring is given as stiffness/damping: what motion's
 * findSpring resolves 0.5 s / 0.2 to.
 */
const SETTLE = { bounceDamping: 29, bounceStiffness: 324 };
const SETTLE_NOW = { bounceDamping: 1e7, bounceStiffness: 1e6 };
/** A lifted row. Both shadows have the same shape and units, so motion can blend them. */
const LIFT =
  "0px 0px 0px 1px rgba(0,0,0,0.08), 0px 1px 2px -1px rgba(0,0,0,0.08), 0px 2px 4px 0px rgba(0,0,0,0.06)";
const FLAT =
  "0px 0px 0px 0px rgba(0,0,0,0), 0px 0px 0px 0px rgba(0,0,0,0), 0px 0px 0px 0px rgba(0,0,0,0)";

/** #12: the digit of a new favorite rises in after the star's pop; it fades away when the star goes. */
const DIGIT_CSS = `
.y-digit { opacity: 0; transform: translateY(25%); transition: opacity 125ms ${EASE_OUT_CSS}, transform 0s linear 125ms; }
.y-digit[data-on="true"] { opacity: 1; transform: none; transition: opacity 150ms ${EASE_OUT_CSS} 80ms, transform 150ms ${EASE_OUT_CSS} 80ms; }
@media (prefers-reduced-motion: reduce) { .y-digit, .y-digit[data-on="true"] { transform: none; } }
`;

const ROW =
  "group/row relative flex h-9 cursor-default items-center gap-2.5 rounded-[10px] pr-2 pl-4 select-none pointer-coarse:h-11";

const Header = ({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: string;
}) => (
  <div
    className="text-muted-foreground flex h-7 items-center gap-1.5 px-2.5 text-[11px] tracking-wide uppercase"
    role="presentation"
  >
    {children}
    {right && <span className="ml-auto tabular-nums">{right}</span>}
  </div>
);

/** Logo, name (the source only when another source has the same name), the check on the chat's model. */
const Body = ({
  m,
  isCurrent,
  faded,
}: {
  m: PickerModel;
  isCurrent: boolean;
  faded: boolean;
}) => {
  const t = useTranslations("chat.picker");
  const { sameTitle } = usePickerData();
  return (
    <span
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2.5 transition-opacity duration-150 ease-[ease]",
        faded && "opacity-50"
      )}
    >
      <BrandLogo label={m.makerTitle} logo={m.logo} size={20} />
      <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
        <span className="truncate">{m.title}</span>
        {sameTitle(m.title) && (
          <span className="text-muted-foreground shrink-0 text-xs">
            {m.source}
          </span>
        )}
        {isCurrent && (
          <>
            <Check className="text-primary size-3.5 shrink-0" />
            <span className="sr-only">{t("inChatNow")}</span>
          </>
        )}
      </span>
    </span>
  );
};

/**
 * The 24px slot at the end of a row: the digit on top of the star. Hovering the row (or reaching it with the arrow
 * keys — then without a transition) swaps them (#14). Without a digit the star is always there; on touch too.
 */
const Slot = ({
  m,
  on,
  digit,
  onToggle,
}: {
  m: PickerModel;
  on: boolean;
  digit: number | null;
  onToggle: () => void;
}) => {
  const t = useTranslations("chat.picker");
  // The digit keeps its number while it fades out.
  const [last, setLast] = useState(digit);
  if (digit !== null && digit !== last) {
    setLast(digit);
  }
  const hasDigit = digit !== null;
  return (
    <span className="relative flex size-6 shrink-0 items-center justify-center">
      <StarToggle
        className={cn(
          "size-6 transition-opacity duration-150 ease-[ease] in-data-[nav=key]:transition-none",
          hasDigit &&
            "opacity-0 group-hover/row:opacity-100 group-data-[swap=true]/row:opacity-100 pointer-coarse:opacity-100"
        )}
        label={t(on ? "unstar" : "star", { title: m.title })}
        on={on}
        onToggle={onToggle}
      />
      <span
        aria-hidden
        className="y-digit pointer-events-none absolute inset-0 flex items-center justify-center pointer-coarse:hidden"
        data-on={hasDigit}
      >
        <Kbd className="size-5 px-0 text-[11px] tabular-nums transition-opacity duration-150 ease-[ease] group-hover/row:opacity-0 group-data-[swap=true]/row:opacity-0 in-data-[nav=key]:transition-none">
          {last}
        </Kbd>
      </span>
    </span>
  );
};

interface RowProps {
  "aria-selected": boolean;
  "data-selected": boolean;
  "data-swap": boolean;
  id: string;
  onClick: (e: React.MouseEvent) => void;
  onPointerCancel: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  role: "option";
}

/** A favorite: dragged only by its grip, so a click anywhere else on the row still picks (#16, #17). */
const FavRow = ({
  id,
  row,
  lifted,
  layout,
  settle,
  onDragStart,
  onDragEnd,
  onSettled,
  children,
}: {
  id: string;
  row: RowProps;
  lifted: boolean;
  layout: typeof SNAP | typeof SPRING_REFLOW;
  settle: typeof SETTLE;
  onDragStart: () => void;
  onDragEnd: (e: PointerEvent | MouseEvent | TouchEvent) => void;
  onSettled: () => void;
  children: React.ReactNode;
}) => {
  const controls = useDragControls();
  return (
    <Reorder.Item
      {...row}
      as="div"
      className={cn(ROW, lifted && "bg-popover")}
      dragControls={controls}
      dragListener={false}
      dragTransition={settle}
      onDragEnd={onDragEnd}
      onDragStart={onDragStart}
      onDragTransitionEnd={onSettled}
      style={{ boxShadow: FLAT }}
      transition={{ boxShadow: { duration: 0.15, ease: EASE_OUT }, layout }}
      value={id}
      whileDrag={{ boxShadow: LIFT }}
    >
      <span
        aria-hidden
        className="text-muted-foreground absolute inset-y-0 left-0 flex w-4 cursor-grab touch-none items-center justify-center opacity-0 transition-opacity duration-150 ease-[ease] group-hover/row:opacity-100 active:cursor-grabbing pointer-coarse:opacity-100"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => {
          // Keep focus on the list and the click away from the row.
          e.preventDefault();
          e.stopPropagation();
          controls.start(e);
        }}
      >
        <GripVertical className="size-3" />
      </span>
      {children}
    </Reorder.Item>
  );
};

// oxlint-disable-next-line eslint/complexity -- one surface with its own keys, drag and peek; split, it reads worse
export const FavoritesPicker = ({
  current,
  favorites,
  onPick,
  onOpenPalette,
  onClose,
  open = true,
}: {
  current: PickerModel;
  favorites: Favorites;
  /** `dir` = sign(index of the picked row − index of the current one) in this list, for the chip's odometer. */
  onPick: (m: PickerModel, dir: -1 | 0 | 1) => void;
  /** Row 0, ⌘/ or a typed letter. `origin` — the viewport centre of row 0, when it was clicked. */
  onOpenPalette: (o: {
    via: "key" | "mouse";
    origin?: { x: number; y: number } | null;
    initialQuery?: string;
  }) => void;
  /** Esc / Tab. */
  onClose: () => void;
  /** False while the popover plays its exit: the phone's peek sheet leaves with it instead of vanishing. */
  open?: boolean;
}) => {
  const t = useTranslations("chat.picker");
  const data = usePickerData();
  const { exists } = data;
  // Rows only ever hold models in chat or the chat's own model, which may have left it since the page opened.
  const anyModel = (id: string) => data.byId(id) ?? current;
  const uid = useId();
  const optId = (key: string) => `${uid}-${key === ENTRY ? "entry" : key}`;
  const reduce = useReducedMotion() ?? false;

  // Frozen at open: favorites (their order still changes), or — with none — the recent ones; the chat's model when
  // it is not among them. A star added here lights up in place and gets its digit; the row moves next time.
  // oxlint-disable-next-line react/hook-use-state -- frozen at open on purpose: nothing sets it again
  const [frozen] = useState(() => {
    const favs = favorites.ids.filter(exists);
    if (favs.length > 0) {
      return {
        empty: false,
        extras: favs.includes(current.id) ? [] : [current.id],
        favs,
      };
    }
    const recent = data.recent.filter(exists).slice(0, 3);
    return {
      empty: true,
      extras: recent.includes(current.id) ? recent : [...recent, current.id],
      favs,
    };
  });
  const [order, setOrder] = useState(frozen.favs);
  /** Soft un-stars: applied to `favorites` when the picker closes (unmounts). */
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const [sel, setSel] = useState(current.id);
  /** How the highlight got where it is: from the keyboard the digit↔star swap is instant (#14). */
  const [nav, setNav] = useState<"open" | "key" | "pointer">("open");
  /** ⌥↑/⌥↓ moves snap, a drag springs (#16). */
  const [moveVia, setMoveVia] = useState<"key" | "drag">("drag");
  const [dragging, setDragging] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  /** Re-renders once the popover's entrance ends: the first highlight was measured inside a scaled popup. */
  const [, remeasure] = useReducer((n: number) => n + 1, 0);

  const source = useRef<NavSource>("snap");
  const rootRef = useRef<HTMLDivElement>(null);
  // --- the model peek: hover (350 ms), arrows (at once), long tap on touch (450 ms) ---
  const [peek, setPeek] = useState<null | "hover" | "key" | "touch">(null);
  const [peekPlace, setPeekPlace] = useState<"right" | "above" | "sheet">(
    "right"
  );
  const timers = useRef<{
    peek?: ReturnType<typeof setTimeout>;
    hide?: ReturnType<typeof setTimeout>;
    aim?: ReturnType<typeof setTimeout>;
  }>({});
  const peekBox = useRef<HTMLDivElement>(null);
  const peekCard = useRef<HTMLDivElement>(null);
  const longPressed = useRef(false);
  // The card can be reached with the pointer: a moment to cross the gap, and rows crossed on the way don't take it.
  const aim = useRef<{ x: number; y: number } | null>(null);
  useEffect(
    () => () => {
      clearTimeout(timers.current.peek);
      clearTimeout(timers.current.hide);
      clearTimeout(timers.current.aim);
    },
    []
  );
  const listRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, endedAt: 0 });
  const latest = useRef({ favorites, order, pending });
  useLayoutEffect(() => {
    latest.current = { favorites, order, pending };
  });

  // Soft un-stars land when the popover closes and unmounts this.
  useEffect(
    () => () => {
      const drop = [...latest.current.pending];
      if (drop.length > 0) {
        latest.current.favorites.removeMany(drop);
      }
    },
    []
  );

  // Focus on the list at once (Base UI would pick it too: it is the only tabbable thing here), then re-measure the
  // highlight once the popup's zoom-in is over.
  useEffect(() => {
    const root = rootRef.current;
    root?.focus({ preventScroll: true });
    const running: Animation[] = [];
    for (let el = root?.parentElement; el; el = el.parentElement) {
      running.push(...el.getAnimations());
    }
    if (running.length === 0) {
      return;
    }
    let live = true;
    const settle = async () => {
      await Promise.allSettled(running.map((a) => a.finished));
      if (live) {
        remeasure();
      }
    };
    void settle();
    return () => {
      live = false;
    };
  }, []);

  // «Все модели» is the last row: the models come first, the way out to the palette sits under them.
  const rows = [...frozen.extras, ...(frozen.empty ? [] : order), ENTRY];
  const picks = rows.slice(0, -1);
  const inOrder = (id: string) => order.includes(id);
  const isOn = (id: string) =>
    inOrder(id) ? !pending.has(id) : favorites.has(id);
  const digitOf = (id: string) => {
    if (!isOn(id)) {
      return null;
    }
    const i = inOrder(id) ? order.indexOf(id) : favorites.ids.indexOf(id);
    return i >= 0 && i < 9 ? i + 1 : null;
  };
  const byDigit = new Map<number, string>();
  for (const id of picks) {
    const d = digitOf(id);
    if (d !== null) {
      byDigit.set(d, id);
    }
  }

  const { ref: hl } = useListHighlight({
    container: listRef,
    source,
  });

  /**
   * Where the peek goes, decided when it appears: a sheet on touch (at the bottom edge, never over the list being
   * pressed), beside the list when the right side has room, above the picker when there is room there (a narrow
   * window), else the sheet too (a narrow window and many favorites).
   */
  const cardHeight = useRef(170);
  const showPeek = (how: "hover" | "key" | "touch") => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    const r = root.getBoundingClientRect();
    let place: "right" | "above" | "sheet" = "sheet";
    if (how !== "touch" && !window.matchMedia("(pointer: coarse)").matches) {
      if (r.right + 12 + 256 <= window.innerWidth - 8) {
        place = "right";
      } else if (r.top - 12 - cardHeight.current >= 8) {
        place = "above";
      }
    }
    setPeekPlace(place);
    setPeek((p) => p ?? how);
  };
  const rowEl = (key: string) =>
    document.querySelector<HTMLElement>(`#${CSS.escape(optId(key))}`);
  const select = (key: string, how: NavSource, via: "key" | "pointer") => {
    if (key !== sel) {
      source.current = how;
      setSel(key);
      if (via === "key") {
        // The keyboard keeps the row in view; the pointer is already on it.
        requestAnimationFrame(() =>
          rowEl(key)?.scrollIntoView({ block: "nearest" })
        );
      }
    }
    if (via !== nav) {
      setNav(via);
    }
  };
  const hover = (key: string) => {
    if (!drag.current.active) {
      select(key, "step", "pointer");
    }
  };

  const pick = (id: string) => {
    const a = picks.indexOf(id);
    const b = picks.indexOf(current.id);
    onPick(
      anyModel(id),
      a === -1 || b === -1 ? 0 : (Math.sign(a - b) as -1 | 0 | 1)
    );
  };
  const clickRow = (id: string, at: number) => {
    // A long tap shows the peek; the click that ends it does not pick.
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    // The click that ends a drag is not a pick.
    if (drag.current.active || at - drag.current.endedAt < 300) {
      return;
    }
    pick(id);
  };
  const openFromEntry = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    onOpenPalette({
      origin: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
      via: "mouse",
    });
  };

  const toggleStar = (id: string, viaKey: boolean) => {
    const adding = !isOn(id);
    if (inOrder(id)) {
      setPending((p) => {
        const next = new Set(p);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    } else {
      // Rows outside the favorites (the chat's model, the recent ones) star for real: they do not move anyway.
      favorites.toggle(id);
    }
    if (viaKey && adding) {
      // StarToggle pops on a click by itself; for ⌘D play the same moment once the star is gold.
      requestAnimationFrame(() => popStar(rowEl(id)));
    }
  };

  const commitOrder = (next: string[]) => {
    const f = latest.current.favorites;
    f.reorder([...next, ...f.ids.filter((id) => !next.includes(id))]);
  };
  const move = (d: 1 | -1) => {
    const i = order.indexOf(sel);
    const j = i + d;
    if (i === -1 || j < 0 || j >= order.length) {
      return;
    }
    const next = [...order];
    [next[i], next[j]] = [next[j] as string, next[i] as string];
    source.current = "snap";
    setMoveVia("key");
    setOrder(next);
    commitOrder(next);
    setAnnounce(t("movedTo", { position: j + 1, title: anyModel(sel).title }));
  };

  const activate = (key: string) => {
    if (key === ENTRY) {
      onOpenPalette({ via: "key" });
    } else {
      pick(key);
    }
  };

  // oxlint-disable-next-line eslint/complexity -- one switch over the keys the list answers
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing || e.key === "Process") {
      return;
    }
    const mod = e.metaKey || e.ctrlKey;
    const done = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    // By e.code: on ЙЦУКЕН e.key of these keys is a different character, with ⌥ on a Mac another one again.
    if (mod && !e.altKey && e.code === "Slash") {
      done();
      onOpenPalette({ via: "key" });
      return;
    }
    const digit = /^(?:Digit|Numpad)(?<n>[1-9])$/u.exec(e.code)?.groups?.n;
    if (digit && !e.altKey && !e.shiftKey) {
      const id = byDigit.get(Number(digit));
      if (id) {
        done();
        pick(id);
      }
      return;
    }
    if (mod && !e.altKey && !e.shiftKey && e.code === "KeyD") {
      done();
      if (sel !== ENTRY) {
        toggleStar(sel, true);
      }
      return;
    }
    if (mod) {
      return;
    }
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp": {
        done();
        if (!peek) {
          showPeek("key");
        }
        const d = e.key === "ArrowDown" ? 1 : -1;
        if (e.altKey) {
          move(d);
        } else {
          const i = Math.max(0, rows.indexOf(sel));
          select(
            rows[(i + d + rows.length) % rows.length] as string,
            e.repeat || e.shiftKey ? "snap" : "step",
            "key"
          );
        }
        return;
      }
      case "Home":
      case "End": {
        done();
        select(
          (e.key === "Home" ? rows[0] : rows.at(-1)) as string,
          "snap",
          "key"
        );
        return;
      }
      case "Enter":
      case " ": {
        done();
        if (!e.repeat) {
          activate(sel);
        }
        return;
      }
      case "Escape": {
        done();
        onClose();
        return;
      }
      case "Tab": {
        done();
        onClose();
        return;
      }
      default:
    }
    // Any letter goes to the palette's search (not digits: they pick; not IME: handled above).
    if (!e.altKey && e.key.length === 1 && /\p{L}/u.test(e.key)) {
      done();
      onOpenPalette({ initialQuery: e.key, via: "key" });
    }
  };

  // Beside the list the card is centred on its row and kept on screen. Written straight to the node: a fresh card is
  // placed before its first frame (no glide in from where the last one stood), a shown one glides after the row.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const box = peekBox.current;
    const card = peekCard.current;
    if (card) {
      cardHeight.current = card.offsetHeight;
    }
    const row = rowEl(sel);
    if (peekPlace !== "right" || !root || !box || !card || !row) {
      return;
    }
    const r = root.getBoundingClientRect();
    const rr = row.getBoundingClientRect();
    const h = card.offsetHeight;
    const top = Math.round(
      Math.max(
        8 - r.top,
        Math.min(
          rr.top + rr.height / 2 - r.top - h / 2,
          window.innerHeight - 8 - h - r.top
        )
      )
    );
    if (box.dataset.top === String(top)) {
      return;
    }
    const fresh = box.dataset.top === undefined;
    box.dataset.top = String(top);
    box.style.transition = fresh ? "none" : "";
    box.style.transform = `translateY(${top}px)`;
    if (fresh) {
      // Commit the jump before the transition comes back.
      box.getBoundingClientRect();
      box.style.transition = "";
    }
  });

  // Heading for the card: inside the triangle from where the pointer last was on the card's row to the card's near
  // edge, 32px past its ends for a forgiving aim — the safe triangle of submenus.
  const headingToPeek = (x: number, y: number) => {
    const a = aim.current;
    const c = peekCard.current?.getBoundingClientRect();
    if (!a || !c || peekPlace === "sheet") {
      return false;
    }
    const [b, d] =
      peekPlace === "right"
        ? [
            { x: c.left, y: c.top - 32 },
            { x: c.left, y: c.bottom + 32 },
          ]
        : [
            { x: c.left - 32, y: c.bottom },
            { x: c.right + 32, y: c.bottom },
          ];
    const side = (p: { x: number; y: number }, q: { x: number; y: number }) =>
      (q.x - p.x) * (y - p.y) - (q.y - p.y) * (x - p.x);
    const s = [side(a, b), side(b, d), side(d, a)];
    return s.every((v) => v >= 0) || s.every((v) => v <= 0);
  };

  const rowProps = (id: string): RowProps => ({
    "aria-selected": sel === id,
    "data-selected": sel === id,
    "data-swap": sel === id && nav === "key",
    id: optId(id),
    onClick: (e: React.MouseEvent) => clickRow(id, e.timeStamp),
    onPointerCancel: () => clearTimeout(timers.current.peek),
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType !== "touch") {
        return;
      }
      clearTimeout(timers.current.peek);
      timers.current.peek = setTimeout(() => {
        longPressed.current = true;
        select(id, "snap", "pointer");
        showPeek("touch");
        navigator.vibrate?.(8);
      }, 450);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (
        e.pointerType === "mouse" &&
        id !== sel &&
        (peek === "hover" || peek === "key") &&
        headingToPeek(e.clientX, e.clientY)
      ) {
        // Crossing other rows on the way to the card: it stays; a pointer that settles here takes this row.
        clearTimeout(timers.current.aim);
        timers.current.aim = setTimeout(() => {
          aim.current = null;
          hover(id);
        }, 120);
        return;
      }
      clearTimeout(timers.current.aim);
      aim.current = { x: e.clientX, y: e.clientY };
      hover(id);
      if (e.pointerType === "mouse" && peek === null) {
        clearTimeout(timers.current.peek);
        timers.current.peek = setTimeout(() => showPeek("hover"), 350);
      }
    },
    onPointerUp: () => clearTimeout(timers.current.peek),
    role: "option",
  });

  const plainRow = (id: string) => {
    const m = anyModel(id);
    return (
      <div {...rowProps(id)} className={ROW} key={id}>
        <Body faded={false} isCurrent={id === current.id} m={m} />
        <Slot
          digit={digitOf(id)}
          m={m}
          on={isOn(id)}
          onToggle={() => toggleStar(id, false)}
        />
      </div>
    );
  };

  const layout = reduce || moveVia === "key" ? SNAP : SPRING_REFLOW;
  // Nine favorites fit, the tenth scrolls (plus the header and the «Сейчас» row); never past the space above the chip.
  const visibleRows = 9 + (frozen.empty ? 0 : frozen.extras.length);

  return (
    <>
      <style>{DIGIT_CSS + PEEK_CSS}</style>
      <div
        aria-activedescendant={optId(sel)}
        aria-label={t("models")}
        onPointerEnter={() => {
          // Back on the list, or on the card (it lives inside this box): the peek stays; the next row is taken as is.
          clearTimeout(timers.current.hide);
          aim.current = null;
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") {
            clearTimeout(timers.current.peek);
            clearTimeout(timers.current.aim);
            // A moment to cross the gap to the card; reaching it (or coming back to the list) cancels the hide.
            timers.current.hide = setTimeout(
              () => setPeek((p) => (p === "hover" ? null : p)),
              200
            );
          }
        }}
        className="relative flex min-h-0 flex-col outline-none [&_[role=option]]:select-none [&_[role=option]]:[-webkit-touch-callout:none]"
        data-nav={nav}
        onKeyDown={onKeyDown}
        ref={rootRef}
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- rows hold a star, a grip and a digit: <select> cannot
        role="listbox"
        tabIndex={0}
      >
        {/* The model peek: beside the list, centred on the row (desktop); a bottom sheet on touch (portaled — the
            popover's positioner is transformed, `fixed` inside it would not reach the screen) */}
        {peek &&
          sel !== ENTRY &&
          (peekPlace === "sheet" ? (
            createPortal(
              <div
                aria-hidden
                className="pointer-events-none fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-[60]"
              >
                <style>{PEEK_CSS}</style>
                <div
                  className="y-peek-sheet"
                  data-closing={open ? undefined : ""}
                >
                  <PeekCard className="w-full" m={anyModel(sel)} vs={current} />
                </div>
              </div>,
              document.body
            )
          ) : (
            <div
              aria-hidden
              className={cn(
                "pointer-events-none absolute",
                peekPlace === "right"
                  ? "top-0 left-[calc(100%+4px)] pl-2"
                  : "right-0 bottom-[calc(100%+12px)] left-0"
              )}
              key={peekPlace}
              // Clipped only on the left, at the picker's edge: the card slides out from under the list, its shadow intact.
              style={
                peekPlace === "right"
                  ? { clipPath: "inset(-100vh -100vw -100vh 0)" }
                  : undefined
              }
            >
              <div
                className={cn(peekPlace === "right" && "y-peek")}
                ref={peekBox}
              >
                <div
                  className={cn(
                    "pointer-events-auto",
                    peek !== "key" &&
                      (peekPlace === "right"
                        ? "y-peek-in origin-left"
                        : "y-peek-up origin-bottom")
                  )}
                  ref={peekCard}
                >
                  <PeekCard
                    className={peekPlace === "above" ? "w-full" : undefined}
                    m={anyModel(sel)}
                    vs={current}
                  />
                </div>
              </div>
            </div>
          ))}

        <motion.div
          className="relative min-h-0 overflow-y-auto overscroll-contain [--row:36px] pointer-coarse:[--row:44px]"
          layoutScroll
          ref={listRef}
          style={{
            maxHeight: `min(calc(4px + ${visibleRows} * var(--row)), calc(var(--available-height, 100dvh) - 62px))`,
          }}
        >
          {/* The one highlight that travels under the rows (#3); hidden while a row is lifted */}
          <div
            aria-hidden
            className={cn(
              "bg-accent pointer-events-none absolute inset-x-0 top-0 h-9 rounded-[10px]",
              dragging && "invisible"
            )}
            ref={hl}
            style={{ opacity: 0 }}
          />

          {/* No «Избранное» title: the digits on the rows already say what this list is. */}
          {frozen.empty ? (
            <>
              <p className="text-muted-foreground p-2.5 text-sm">
                {t("noFavorites")}
              </p>
              {frozen.extras.length > 0 && <Header>{t("recent")}</Header>}
              {frozen.extras.map(plainRow)}
            </>
          ) : (
            <>
              {/* «Сейчас»: the chat's model when it is not a favorite, with an outline star */}
              {frozen.extras.map(plainRow)}
              <Reorder.Group
                aria-label={t("favorites")}
                as="div"
                axis="y"
                onReorder={setOrder}
                // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a group of options inside the custom listbox
                role="group"
                values={order}
              >
                {order.map((id) => {
                  const m = anyModel(id);
                  return (
                    <FavRow
                      id={id}
                      key={id}
                      layout={layout}
                      lifted={dragging === id}
                      onDragEnd={(e) => {
                        drag.current = { active: false, endedAt: e.timeStamp };
                        commitOrder(latest.current.order);
                      }}
                      onDragStart={() => {
                        drag.current.active = true;
                        setMoveVia("drag");
                        setDragging(id);
                        select(id, "snap", "pointer");
                      }}
                      onSettled={() => setDragging(null)}
                      row={rowProps(id)}
                      settle={reduce ? SETTLE_NOW : SETTLE}
                    >
                      <Body
                        faded={pending.has(id)}
                        isCurrent={id === current.id}
                        m={m}
                      />
                      <Slot
                        digit={digitOf(id)}
                        m={m}
                        on={isOn(id)}
                        onToggle={() => toggleStar(id, false)}
                      />
                    </FavRow>
                  );
                })}
              </Reorder.Group>
            </>
          )}
        </motion.div>
        {/* The way to every model, under the list: a quiet footer row, ⌘/ says the palette opens from anywhere */}
        <div className="bg-border/70 mx-1 my-1 h-px shrink-0" />
        {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus -- an option of the listbox: keys and focus live on the list (aria-activedescendant) */}
        <div
          aria-selected={sel === ENTRY}
          className={cn(
            "text-muted-foreground flex h-9 shrink-0 cursor-default items-center gap-2 rounded-[10px] px-2.5 text-sm transition-colors duration-150 select-none pointer-coarse:h-11",
            "[@media(hover:hover)]:hover:bg-muted [@media(hover:hover)]:hover:text-foreground",
            sel === ENTRY && "bg-muted text-foreground"
          )}
          data-selected={sel === ENTRY}
          id={optId(ENTRY)}
          onClick={(e) => openFromEntry(e.currentTarget)}
          onPointerMove={() => hover(ENTRY)}
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an option of the custom listbox
          role="option"
        >
          <LayoutGrid className="size-4 shrink-0" />
          <span className="flex-1 truncate">
            {t("allModels", { count: data.models.length })}
          </span>
          <Kbd>⌘/</Kbd>
        </div>
      </div>
      <div aria-live="polite" className="sr-only">
        {announce}
      </div>
    </>
  );
};
