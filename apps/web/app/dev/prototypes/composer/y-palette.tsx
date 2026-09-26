"use client";

// Round 4 «Щелчок»: the palette on ⌘/ (spec §4). One table for every model: search on top, a sticky row of
// capability keys and column headers, sticky maker headers, rows on one grid, and an inspector at the bottom that
// compares the highlighted model with the chat's own and warns about what the chat already holds (context, images).
// Always mounted (keepMounted), so a keyboard opening is a store flip — no animation, rows already there. A mouse
// opening from the picker grows from the field that was clicked. Only real fields are shown; nothing is «recommended».
import { Button } from "@metobe/ui/components/button";
import { Command, CommandGroup, CommandInputBare, CommandItem, CommandList } from "@metobe/ui/components/command";
import { Dialog, DialogClose, DialogOverlay, DialogPopup, DialogPortal, DialogTitle } from "@metobe/ui/components/dialog";
import { Kbd } from "@metobe/ui/components/kbd";
import { Badge } from "@metobe/ui/components/reui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowDown, Brain, Check, ChevronRight, Clock, Eye, Search, Star, TriangleAlert, Wrench } from "lucide-react";
import { createContext, Fragment, memo, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

import { BrandLogo } from "@/components/brand-logo";

import { ALL_MODELS, anyModel, type ChatModel, DEFAULT_MODEL, fmtContext, RECENT, usageOf } from "./data";
import type { Favorites } from "./t3-kit";
import { EASE_IN_OUT_CSS, EASE_OUT_CSS, type NavSource, popStar, RollingCount, StarToggle, useListHighlight, Y_CSS } from "./y-motion";

export type PaletteOpening = { via: "key" | "mouse"; origin?: { x: number; y: number } | null; initialQuery?: string };

// --- data helpers ----------------------------------------------------------------------------------

type CapKey = "vision" | "tools" | "reasoning";
const CAPS: { key: CapKey; icon: typeof Eye; label: string }[] = [
  { icon: Eye, key: "vision", label: "Картинки" },
  { icon: Wrench, key: "tools", label: "Инструменты" },
  { icon: Brain, key: "reasoning", label: "Размышления" },
];

type SortKey = "maker" | "context" | "price" | "latency";
type Sort = { key: SortKey; dir: "asc" | "desc" };
const NATURAL: Record<Exclude<SortKey, "maker">, "asc" | "desc"> = { context: "desc", latency: "asc", price: "asc" };
const SORT_CYCLE: SortKey[] = ["maker", "context", "price", "latency"];

const NOW = Date.now();
const DAY = 86_400_000;
const isNew = (m: ChatModel) => m.released !== null && NOW - Date.parse(m.released) < 90 * DAY;

/** Titles that come from more than one source: only then the row names its source. */
const DUP_TITLES = (() => {
  const seen = new Map<string, number>();
  for (const m of ALL_MODELS) {
    const k = m.title.toLowerCase();
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));
})();

const NF2 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const NF1 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const sym = (c: "USD" | "RUB") => (c === "USD" ? "$" : "₽");
const money = (v: number, c: "USD" | "RUB") => `${NF2.format(v)} ${sym(c)}`;
const priceCell = (m: ChatModel) => (m.price ? `${NF2.format(m.price.input)} / ${NF2.format(m.price.output)} ${sym(m.price.currency)}` : "—");
const secs = (ms: number | null) => (ms === null ? "—" : `${NF1.format(ms / 1000)} с`);

const plural = (n: number, one: string, few: string, many: string) => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) {
    return many;
  }
  if (b > 1 && b < 5) {
    return few;
  }
  return b === 1 ? one : many;
};
/** «в 2,5 раза», «в 12 раз», «в 22 раза»: fractions always take «раза». */
const times = (r: number) => {
  const v = r < 10 ? Math.round(r * 10) / 10 : Math.round(r);
  return `в ${NF1.format(v)} ${Number.isInteger(v) ? plural(v, "раз", "раза", "раз") : "раза"}`;
};
const ago = (days: number) => (days === 0 ? "сегодня" : days === 1 ? "вчера" : `${days} ${plural(days, "день", "дня", "дней")} назад`);
const DATE = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });
const DATE_Y = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });
const fmtDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return (d.getFullYear() === new Date(NOW).getFullYear() ? DATE : DATE_Y).format(d).replace(/\s?г\.$/u, "");
};

// --- search ------------------------------------------------------------------------------------------

const WORD = /[\s\-_/]+/u;
const WORD_EDGE = /[\s\-_/]/u;
const isSubsequence = (t: string, s: string) => {
  let i = 0;
  for (const ch of s) {
    if (ch === t[i]) {
      i += 1;
    }
    if (i === t.length) {
      return true;
    }
  }
  return false;
};

/** 4 — the title starts with it, 3 — a word of the title does, 2 — anywhere in title/maker/source/id, 1 — letters in order in the title. */
const tokenScore = (t: string, title: string, words: string[], hay: string, single: boolean) => {
  if (title.startsWith(t)) {
    return 4;
  }
  if (words.some((w) => w.startsWith(t))) {
    return 3;
  }
  if (hay.includes(t)) {
    return 2;
  }
  return single && t.length >= 2 && isSubsequence(t, title) ? 1 : 0;
};

/** Which title characters matched, as "0110…" — also the rows' memo key for the search. */
const markTitle = (title: string, tokens: string[], single: boolean) => {
  const lower = title.toLowerCase();
  const on = Array.from({ length: title.length }, () => false);
  for (const t of tokens) {
    let at = lower.startsWith(t) ? 0 : -1;
    for (let i = 1; at < 0 && i < lower.length; i++) {
      if (WORD_EDGE.test(lower[i - 1]) && lower.startsWith(t, i)) {
        at = i;
      }
    }
    if (at < 0) {
      at = lower.indexOf(t);
    }
    if (at >= 0) {
      for (let k = at; k < at + t.length; k++) {
        on[k] = true;
      }
    } else if (single && t.length >= 2) {
      let j = 0;
      for (let k = 0; k < lower.length && j < t.length; k++) {
        if (lower[k] === t[j]) {
          on[k] = true;
          j += 1;
        }
      }
    }
  }
  return on.map((b) => (b ? "1" : "0")).join("");
};

/** ЙЦУКЕН → QWERTY by key position: «сдфгву» → claude. The dot is left alone, so «4.6» survives. */
const RU = "йцукенгшщзхъфывапролджэячсмитьбюё";
const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const toLatin = (s: string) =>
  [...s.toLowerCase()]
    .map((ch) => {
      const i = RU.indexOf(ch);
      return i >= 0 ? EN[i] : ch;
    })
    .join("");

type Entry = { m: ChatModel; mask?: string; sourceHit?: boolean };
type Heading =
  | { kind: "fav"; count: number }
  | { kind: "recent" }
  | { kind: "maker"; maker: string; title: string; count: number }
  | { kind: "label"; title: string; count: number };
type Section = { key: string; heading?: Heading; entries: Entry[] };

const byTitle = (a: ChatModel, b: ChatModel) => a.title.localeCompare(b.title, "ru");

const rank = (pool: ChatModel[], q: string, frozen: string[]): Entry[] => {
  const tokens = q.toLowerCase().split(/\s+/u).filter(Boolean);
  const single = tokens.length === 1;
  const scored: (Entry & { score: number })[] = [];
  for (const m of pool) {
    const title = m.title.toLowerCase();
    const words = title.split(WORD);
    const hay = `${title} ${m.makerTitle} ${m.source} ${m.id}`.toLowerCase();
    let score = 0;
    for (const t of tokens) {
      const s = tokenScore(t, title, words, hay, single);
      if (!s) {
        score = 0;
        break;
      }
      score += s;
    }
    if (score > 0) {
      const src = m.source.toLowerCase();
      scored.push({ m, mask: markTitle(m.title, tokens, single), score, sourceHit: tokens.some((t) => t.length >= 2 && src.includes(t)) });
    }
  }
  // Ties: favorites, then recent, then what this user ran more, then the name. The snapshot, so starring a
  // model mid-search does not make its row jump under the cursor.
  const tier = (id: string) => (frozen.includes(id) ? 0 : RECENT.includes(id) ? 1 : 2);
  return scored.sort((a, b) => b.score - a.score || tier(a.m.id) - tier(b.m.id) || usageOf(b.m.id).chats - usageOf(a.m.id).chats || byTitle(a.m, b.m));
};

/** A flat list by one column, `null` always last. Prices never mix currencies: USD, then «В рублях», then none. */
const byColumn = (entries: Entry[], sort: Sort): Section[] => {
  const sign = sort.dir === "asc" ? 1 : -1;
  const cmp = (get: (m: ChatModel) => number | null | undefined) => (a: Entry, b: Entry) => {
    const x = get(a.m) ?? null;
    const y = get(b.m) ?? null;
    if (x === null || y === null) {
      return x === y ? byTitle(a.m, b.m) : x === null ? 1 : -1;
    }
    return (x - y) * sign || byTitle(a.m, b.m);
  };
  if (sort.key === "context") {
    return [{ entries: [...entries].sort(cmp((m) => m.context)), key: "flat" }];
  }
  if (sort.key === "latency") {
    return [{ entries: [...entries].sort(cmp((m) => usageOf(m.id).firstTokenMs)), key: "flat" }];
  }
  const byInput = cmp((m) => m.price?.input);
  const rub = entries.filter((e) => e.m.price?.currency === "RUB").sort(byInput);
  const none = entries.filter((e) => !e.m.price).sort((a, b) => byTitle(a.m, b.m));
  const sections: Section[] = [
    { entries: entries.filter((e) => e.m.price?.currency === "USD").sort(byInput), key: "flat" },
    { entries: rub, heading: { count: rub.length, kind: "label", title: "В рублях" }, key: "rub" },
    { entries: none, heading: { count: none.length, kind: "label", title: "Цена не указана" }, key: "none" },
  ];
  return sections.filter((s) => s.entries.length > 0);
};

const isModel = (m: ChatModel | undefined): m is ChatModel => Boolean(m);

/** No query, by maker: «Избранное» (the user's order), «Недавние» (≤3, not pinned), then makers A→Я, newest first. */
const grouped = (pool: ChatModel[], frozen: string[]): Section[] => {
  const inPool = new Set(pool.map((m) => m.id));
  const favs = frozen.filter((id) => inPool.has(id)).map(anyModel).filter(isModel);
  const pinned = new Set(frozen);
  const recents = RECENT.filter((id) => !pinned.has(id) && inPool.has(id))
    .slice(0, 3)
    .map(anyModel)
    .filter(isModel);
  const taken = new Set([...favs, ...recents].map((m) => m.id));
  const makers = new Map<string, ChatModel[]>();
  for (const m of pool) {
    if (!taken.has(m.id)) {
      makers.set(m.maker, [...(makers.get(m.maker) ?? []), m]);
    }
  }
  const newest = (a: ChatModel, b: ChatModel) => (b.released ?? "").localeCompare(a.released ?? "") || byTitle(a, b);
  const all: Section[] = [
    { entries: favs.map((m) => ({ m })), heading: { count: favs.length, kind: "fav" }, key: "fav" },
    { entries: recents.map((m) => ({ m })), heading: { kind: "recent" }, key: "recent" },
    ...[...makers.values()]
      .sort((a, b) => a[0].makerTitle.localeCompare(b[0].makerTitle, "ru"))
      .map((ms): Section => {
        const sorted = [...ms].sort(newest);
        return {
          entries: sorted.map((m) => ({ m })),
          heading: { count: sorted.length, kind: "maker", maker: sorted[0].maker, title: sorted[0].makerTitle },
          key: `maker:${sorted[0].maker}`,
        };
      }),
  ];
  const sections = all.filter((s) => s.entries.length > 0);
  // A short list reads better without headers.
  return pool.length <= 12 ? [{ entries: sections.flatMap((s) => s.entries), key: "flat" }] : sections;
};

const build = (query: string, caps: CapKey[], sort: Sort, frozen: string[]) => {
  const pool = ALL_MODELS.filter((m) => caps.every((k) => m.caps[k] === true));
  const q = query.trim();
  if (!q) {
    return { layout: null, sections: sort.key === "maker" ? grouped(pool, frozen) : byColumn(pool.map((m) => ({ m })), sort) };
  }
  let entries = rank(pool, q, frozen);
  let layout: string | null = null;
  if (entries.length === 0 && /[а-яё]/iu.test(q)) {
    const latin = toLatin(q);
    const alt = rank(pool, latin, frozen);
    if (alt.length > 0) {
      entries = alt;
      layout = latin.trim();
    }
  }
  const sections: Section[] = sort.key === "maker" ? [{ entries, key: "flat" }] : byColumn(entries, sort);
  return { layout, sections: sections.filter((s) => s.entries.length > 0) };
};

// --- the inspector's third line ----------------------------------------------------------------------

const warningFor = (m: ChatModel, contextTokens?: number, hasImages?: boolean) => {
  if (contextTokens !== undefined && m.context !== null && contextTokens > m.context) {
    return `Этот чат (${fmtContext(contextTokens)}) не поместится в окно ${fmtContext(m.context)}`;
  }
  if (hasImages && m.caps.vision === false) {
    return "Не видит картинки — а в сообщении есть картинки";
  }
  if (hasImages && m.caps.vision === null) {
    return "Источник не сообщил, видит ли картинки";
  }
  return null;
};

/** Up to three differences with the chat's model — window, input price, first token — only where they are real. */
const compareWith = (m: ChatModel, cur: ChatModel) => {
  if (m.id === cur.id) {
    return "Это модель чата";
  }
  const parts: string[] = [];
  if (m.context && cur.context) {
    const r = m.context / cur.context;
    if (r >= 1.1) {
      parts.push(`окно ${times(r)} больше`);
    } else if (1 / r >= 1.1) {
      parts.push(`окно ${times(1 / r)} меньше`);
    }
  }
  if (m.price && cur.price) {
    if (m.price.currency !== cur.price.currency) {
      parts.push("цены в разных валютах");
    } else if (m.price.input > 0 && cur.price.input > 0) {
      const r = m.price.input / cur.price.input;
      if (r >= 1.1) {
        parts.push(`вход ${times(r)} дороже`);
      } else if (1 / r >= 1.1) {
        parts.push(`вход ${times(1 / r)} дешевле`);
      }
    }
  }
  const a = usageOf(m.id).firstTokenMs;
  const b = usageOf(cur.id).firstTokenMs;
  if (a !== null && b !== null && Math.abs(a - b) >= 200) {
    parts.push(`отклик на ${NF1.format(Math.abs(a - b) / 1000)} с ${a > b ? "медленнее" : "быстрее"}`);
  }
  return `Против ${cur.title}: ${parts.length > 0 ? parts.join(" · ") : "примерно так же"}`;
};

// --- layout constants --------------------------------------------------------------------------------

/** Logo · name · capabilities · context · price · first token · star · ⌘N. Narrow: price, first token and ⌘N go. */
const COLS = "grid-cols-[20px_minmax(0,1fr)_60px_44px_96px_48px_20px_32px] @max-[640px]:grid-cols-[20px_minmax(0,1fr)_60px_44px_20px]";
/** Rows under a maker's header: no logo (the header has it), the name under the header's title. */
const COLS_BARE = "grid-cols-[minmax(0,1fr)_60px_44px_96px_48px_20px_32px] @max-[640px]:grid-cols-[minmax(0,1fr)_60px_44px_20px]";
const NUM = "truncate text-right text-xs tabular-nums text-muted-foreground";
const SEL_FG = "group-data-[selected=true]/command-item:text-foreground";
const GROUP = "overflow-visible p-0";
const POPUP =
  "fixed inset-x-0 top-[12vh] z-50 mx-auto flex h-[min(560px,80dvh)] w-[min(760px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none @container max-sm:inset-0 max-sm:h-dvh max-sm:w-full max-sm:rounded-none max-sm:ring-0";
/** Only for a mouse opening (spec №2): grows from the clicked field. Closing is always instant. */
const POPUP_GROW =
  "transition-[opacity,scale] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] data-[starting-style]:scale-[0.96] data-[starting-style]:opacity-0 motion-reduce:transition-opacity motion-reduce:duration-150 motion-reduce:ease-[ease] motion-reduce:data-[starting-style]:scale-100";
const OVERLAY = "bg-black/5 backdrop-blur-none supports-backdrop-filter:backdrop-blur-none data-open:animate-none data-closed:animate-none dark:bg-black/40";
const OVERLAY_FADE = "transition-opacity duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] data-[starting-style]:opacity-0 motion-reduce:duration-150 motion-reduce:ease-[ease]";
const KEY_BASE =
  "flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-xs outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring [transition:translate_100ms_cubic-bezier(0.23,1,0.32,1),box-shadow_100ms_cubic-bezier(0.23,1,0.32,1),background-color_150ms_ease,color_150ms_ease] active:translate-y-px motion-reduce:translate-y-0 motion-reduce:active:translate-y-0";
const KEY_OFF = "bg-background text-muted-foreground shadow-[0_1px_0_0_var(--border)] ring-1 ring-border ring-inset hover:text-foreground";
const KEY_ON = "translate-y-px bg-muted text-foreground shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)] ring-1 ring-foreground/15 ring-inset";

/** The sort arrow: turns 200ms in-out, a new column's arrow appears (only after a click — ⌥S is instant). */
const LOCAL_CSS = `
.yp-arrow { transition: rotate 200ms ${EASE_IN_OUT_CSS}, opacity 150ms ${EASE_OUT_CSS}, scale 150ms ${EASE_OUT_CSS}; }
@starting-style { .yp-arrow { opacity: 0; scale: 0.9; } }
@media (prefers-reduced-motion: reduce) { .yp-arrow { transition: none; } }
`;

const prevent = (e: React.MouseEvent) => e.preventDefault();

/** Whether the popup is actually shown (not `hidden` while kept mounted): the highlight measures only then. */
const Shown = createContext(false);

// --- rows --------------------------------------------------------------------------------------------

const Title = ({ text, mask }: { text: string; mask?: string }) => {
  if (!mask?.includes("1")) {
    return <span className={cn("truncate", mask && "text-foreground/70")}>{text}</span>;
  }
  const runs: { s: string; on: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const on = mask[i] === "1";
    const last = runs.at(-1);
    if (last?.on === on) {
      last.s += text[i];
    } else {
      runs.push({ on, s: text[i] });
    }
  }
  return (
    <span className="text-foreground/70 truncate">
      {runs.map((r, i) =>
        r.on ? (
          <span className="text-foreground font-semibold" key={i}>
            {r.s}
          </span>
        ) : (
          <Fragment key={i}>{r.s}</Fragment>
        )
      )}
    </span>
  );
};

/** Three fixed slots, strictly monochrome: yes — the icon, the source did not say — a faint icon, no — nothing. */
const CapCells = ({ m }: { m: ChatModel }) => (
  <span className="flex">
    {CAPS.map(({ key, icon: Icon, label }) => {
      const v = m.caps[key];
      return (
        <span
          className={cn("flex w-5 justify-center", v === true ? "text-foreground/60" : "text-foreground/25")}
          key={key}
          title={v === null ? "Источник не сообщил" : v ? label : undefined}
        >
          {v !== false && <Icon className="size-3.5" />}
        </span>
      );
    })}
  </span>
);

/** ⌘N for the first nine favorites. Appears after the star's pop when just pinned (№12), fades when unpinned. */
const FavKey = ({ n, fresh }: { n: number | null; fresh: boolean }) => {
  const [last, setLast] = useState(n);
  if (n !== null && n !== last) {
    setLast(n);
  }
  if (last === null) {
    return null;
  }
  return (
    <Kbd className={cn("w-8 justify-center", n === null ? "opacity-0 [transition:opacity_125ms_cubic-bezier(0.23,1,0.32,1)]" : fresh && "y-appear")}>
      ⌘{n ?? last}
    </Kbd>
  );
};

type RowProps = {
  m: ChatModel;
  selected: boolean;
  fav: boolean;
  favIndex: number;
  /** Pinned during this opening (not in the snapshot): its ⌘N plays the entrance. */
  fresh: boolean;
  mask?: string;
  showSource: boolean;
  isCurrent: boolean;
  over: boolean;
  describedBy?: string;
  onSelect: (id: string) => void;
  onStar: (id: string) => void;
  /** Under a maker's header: no logo, indented like the sources list. */
  bare: boolean;
};

const Row = memo(function Row({ m, selected, fav, favIndex, fresh, mask, showSource, isCurrent, over, describedBy, onSelect, onStar, bare }: RowProps) {
  const n = favIndex >= 0 && favIndex < 9 ? favIndex + 1 : null;
  return (
    <CommandItem
      aria-describedby={selected ? describedBy : undefined}
      className={cn(
        "relative z-[1] grid h-9 items-center gap-2 rounded-[10px] px-2 py-0 data-selected:bg-transparent pointer-coarse:h-11 [&>svg:last-child]:hidden",
        bare ? cn(COLS_BARE, "pl-[58px]") : COLS
      )}
      onSelect={onSelect}
      value={m.id}
    >
      {!bare && <BrandLogo label={m.makerTitle} logo={m.maker} size={20} />}
      <span className="flex min-w-0 items-center gap-1.5">
        <Title mask={mask} text={m.title} />
        {isCurrent && <Check aria-label="Модель чата" className="text-primary size-3.5" />}
        {isNew(m) && (
          <Badge radius="full" size="xs" variant="success-light">
            новая
          </Badge>
        )}
        {m.id === DEFAULT_MODEL && <span className="text-muted-foreground shrink-0 text-[11px]">по умолчанию</span>}
        {/* The source, shown for duplicate names or a source match, and for the highlighted row — no height change */}
        {(showSource || selected) && <span className={cn("text-muted-foreground truncate text-xs", !showSource && "animate-in fade-in duration-150")}>через {m.source}</span>}
      </span>
      <CapCells m={m} />
      <span className={cn(NUM, over ? "text-amber-600 dark:text-amber-400" : SEL_FG)}>{fmtContext(m.context) ?? "—"}</span>
      <span
        className={cn(NUM, SEL_FG, "@max-[640px]:hidden")}
        title={m.price ? `вход / выход за 1M${m.price.cacheRead === undefined ? "" : ` · из кэша ${money(m.price.cacheRead, m.price.currency)}`}` : undefined}
      >
        {priceCell(m)}
      </span>
      <span className={cn(NUM, SEL_FG, "@max-[640px]:hidden")}>{secs(usageOf(m.id).firstTokenMs)}</span>
      <span
        className={cn(
          "flex justify-center",
          !fav && "opacity-0 group-hover/command-item:opacity-100 group-data-[selected=true]/command-item:opacity-100 pointer-coarse:opacity-100 max-sm:opacity-100"
        )}
      >
        <StarToggle
          className="size-5"
          iconClassName={fav ? "text-amber-600 dark:text-amber-300" : undefined}
          label={fav ? "Убрать из избранного" : "В избранное"}
          on={fav}
          onToggle={() => onStar(m.id)}
        />
      </span>
      <span className="flex justify-center @max-[640px]:hidden">
        <FavKey fresh={fresh} n={n} />
      </span>
    </CommandItem>
  );
});

/**
 * A group's header, after the sources list: sticky and translucent (rows blur under it as they scroll), a chevron
 * that turns, the logo, the name and the count. A click folds the group; folded groups stay folded next time.
 */
const GroupHeader = ({ h, folded, onToggle }: { h: Heading; folded: boolean; onToggle: () => void }) => {
  const title = h.kind === "fav" ? "Избранное" : h.kind === "recent" ? "Недавние" : h.title;
  const count = h.kind === "recent" ? null : h.count;
  return (
    <button
      aria-expanded={!folded}
      className={cn(
        "group/gh sticky top-8 z-10 -mx-1.5 flex h-9 w-[calc(100%+12px)] items-center gap-2 border-b border-border/50 px-3.5 text-left",
        "bg-muted/60 backdrop-blur-md supports-[backdrop-filter]:bg-muted/45 dark:bg-muted/50",
        "outline-none focus-visible:bg-muted"
      )}
      onClick={onToggle}
      onMouseDown={prevent}
      type="button"
    >
      <ChevronRight
        className={cn(
          "text-muted-foreground size-3.5 shrink-0 transition-[rotate] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
          !folded && "rotate-90"
        )}
      />
      <span className="flex size-5 shrink-0 items-center justify-center">
        {h.kind === "maker" && <BrandLogo label={h.title} logo={h.maker} size={20} />}
        {h.kind === "fav" && <Star className="size-3.5 fill-amber-400 text-amber-500 dark:fill-amber-300 dark:text-amber-300" />}
        {h.kind === "recent" && <Clock className="text-muted-foreground size-3.5" />}
      </span>
      <span className="truncate text-sm font-medium">{title}</span>
      {count !== null && <span className="text-muted-foreground text-xs tabular-nums">{count}</span>}
      {h.kind === "fav" && !folded && (
        <span className="text-muted-foreground ml-auto text-[11px] tabular-nums">{Math.min(h.count, 9) > 1 ? `⌘1–${Math.min(h.count, 9)}` : "⌘1"}</span>
      )}
    </button>
  );
};

// --- the travelling highlight --------------------------------------------------------------------------

/**
 * The one highlight under the rows (№3), plus keeping the selected row in view. Two cmdk quirks handled here: its
 * list re-attaches a composed ref on every render (so a ref to the list is null inside a child's layout effect —
 * we measure inside the sizer, reached through our own stable ref); it learns a controlled value one commit late
 * (its effect runs after ours); and rows remounted under new groups get their `aria-selected` only after cmdk's own
 * effects. So while the DOM does not yet show the row we expect (`present` — it is in the list), we measure again.
 */
const Highlight = ({
  nav,
  value,
  present,
  rowsKey,
  scroll,
}: {
  nav: React.RefObject<NavSource>;
  value: string;
  present: boolean;
  rowsKey: string;
  scroll: { key: number; block: ScrollLogicalPosition };
}) => {
  const shown = useContext(Shown);
  const [tick, setTick] = useState(0);
  const box = useRef<HTMLElement | null>(null);
  const ref = useListHighlight({ container: box, deps: [value, rowsKey, shown, tick], source: nav });
  const attach = useCallback(
    (el: HTMLDivElement | null) => {
      ref.current = el;
      box.current = el?.parentElement ?? null;
    },
    [ref]
  );
  const tries = useRef(0);
  const scrolled = useRef(-1);
  useLayoutEffect(() => {
    const root = box.current;
    if (!shown || !root) {
      return;
    }
    const el = root.querySelector<HTMLElement>('[cmdk-item][aria-selected="true"]');
    const stale = el ? el.dataset.value !== value : present;
    if (stale) {
      if (tries.current < 6) {
        tries.current += 1;
        setTick((t) => t + 1);
      }
      return;
    }
    tries.current = 0;
    if (el && scrolled.current !== scroll.key) {
      scrolled.current = scroll.key;
      el.scrollIntoView({ block: scroll.block });
    }
  });
  return <div aria-hidden className="bg-accent pointer-events-none absolute inset-x-0 top-0 z-0 h-9 rounded-[10px]" ref={attach} />;
};

// --- the inspector ------------------------------------------------------------------------------------

/**
 * The palette's bottom bar, in the list's own language (a translucent strip like the group headers): on the left
 * the one thing that matters about the highlighted model now — a warning, or how it differs from the chat's model;
 * on the right the keys. Everything else lives in the row itself.
 */
const PaletteBar = ({ id, m, current, contextTokens, hasImages }: { id: string; m: ChatModel; current: ChatModel; contextTokens?: number; hasImages?: boolean }) => {
  const warn = warningFor(m, contextTokens, hasImages);
  return (
    <div
      aria-live="off"
      className="bg-muted/45 text-muted-foreground flex h-10 shrink-0 items-center gap-4 border-t border-border/60 px-4 text-xs max-sm:order-1 max-sm:border-t-0 max-sm:border-b"
      id={id}
    >
      {warn ? (
        <span className="flex min-w-0 items-center gap-1.5 text-amber-700 dark:text-amber-300">
          <TriangleAlert className="size-3.5 shrink-0" />
          <span className="truncate">{warn}</span>
        </span>
      ) : (
        <span className="min-w-0 truncate">{compareWith(m, current)}</span>
      )}
      <span className="ml-auto flex shrink-0 items-center gap-3 max-sm:hidden">
        <span className="flex items-center gap-1.5">
          <Kbd>↵</Kbd> выбрать
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>␣</Kbd> в избранное
        </span>
        <span className="flex items-center gap-1.5 @max-[700px]:hidden">
          <Kbd>⌥S</Kbd> сортировка
        </span>
      </span>
    </div>
  );
};

// --- the palette ----------------------------------------------------------------------------------------

/** Where the popup's box starts in the viewport (inset-x-0 mx-auto, top 12vh; full screen under 640px). */
const originFrom = ({ x, y }: { x: number; y: number }) => {
  const vw = window.innerWidth;
  if (vw < 640) {
    return `${x}px ${y}px`;
  }
  const w = Math.min(760, vw - 32);
  return `${x - (vw - w) / 2}px ${y - 0.12 * window.innerHeight}px`;
};

export const ModelPalette = ({
  open,
  onOpenChange,
  opening,
  current,
  favorites,
  onPick,
  contextTokens,
  hasImages,
  onClosed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opening: PaletteOpening;
  current: ChatModel;
  favorites: Favorites;
  onPick: (m: ChatModel, dir: -1 | 0 | 1) => void;
  contextTokens?: number;
  hasImages?: boolean;
  onClosed?: () => void;
}) => {
  const [query, setQuery] = useState("");
  const [caps, setCaps] = useState<CapKey[]>([]);
  const [sort, setSort] = useState<Sort>({ dir: "asc", key: "maker" });
  /** The last sort change came from a click: the arrow may animate. ⌥S and a fresh opening are instant. */
  const [sortAnim, setSortAnim] = useState(false);
  const [value, setValue] = useState(current.id);
  /** Favorites as they were when the palette opened: sections do not reshuffle while it is open. */
  const [frozen, setFrozen] = useState(favorites.ids);
  /** More than 8 s since closing (or never opened): the next opening starts fresh on the chat's model. */
  const [stale, setStale] = useState(true);
  const [wasOpen, setWasOpen] = useState(false);
  const [scroll, setScroll] = useState<{ key: number; block: ScrollLogicalPosition }>({ block: "nearest", key: 0 });
  /** Folded groups; the palette stays mounted, so they stay folded from one opening to the next. */
  const [folded, setFolded] = useState<Set<string>>(() => new Set());
  /** The group just unfolded: its rows fade in once. */
  const [unfolded, setUnfolded] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const nav = useRef<NavSource>("snap");
  const inspectorId = useId();

  // Opening: take the favorites snapshot; a letter from the picker becomes the query; after 8 s the chat's model
  // is selected again (the query and filters were already cleared by the timer while closed).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setFrozen(favorites.ids);
      setScroll((s) => ({ block: "center", key: s.key + 1 }));
      if (opening.initialQuery) {
        setQuery(opening.initialQuery);
        setCaps([]);
      } else if (stale) {
        setValue(current.id);
      }
      setStale(false);
    }
  }

  useEffect(() => {
    if (open) {
      return;
    }
    setSortAnim(false);
    const t = setTimeout(() => {
      setQuery("");
      setCaps([]);
      setStale(true);
    }, 8000);
    return () => clearTimeout(t);
  }, [open]);

  const { sections, layout } = useMemo(() => build(query, caps, sort, frozen), [query, caps, sort, frozen]);
  const isFolded = useCallback((s: Section) => Boolean(s.heading) && folded.has(s.key), [folded]);
  // Rows of folded groups are not in the list at all: arrows skip them, Enter cannot pick them.
  const flatIds = useMemo(() => sections.flatMap((s) => (isFolded(s) ? [] : s.entries.map((e) => e.m.id))), [sections, isFolded]);
  const rowsKey = useMemo(() => sections.map((s) => `${s.key}:${isFolded(s) ? "-" : s.entries.map((e) => e.m.id).join(",")}`).join("|"), [sections, isFolded]);
  const visible = useMemo(() => new Set(flatIds), [flatIds]);
  const subject = (visible.has(value) ? anyModel(value) : undefined) ?? current;
  const filtering = query.trim() !== "" || caps.length > 0;

  // --- keeping the selection across regrouping ---
  // A sort, filter or snapshot change can remount rows under new groups; cmdk then selects the first row. While a
  // hold is on (until the next frame) we put the held row back if it is still visible.
  const hold = useRef<string | null>(null);
  const holdFrame = useRef(0);
  const reassert = useRef<string | null>(null);
  const visibleRef = useRef(visible);
  const holdValue = (id: string) => {
    hold.current = id;
    cancelAnimationFrame(holdFrame.current);
    holdFrame.current = requestAnimationFrame(() => {
      hold.current = null;
    });
  };
  const keep = () => {
    holdValue(value);
    setScroll((s) => ({ block: "nearest", key: s.key + 1 }));
  };
  const onValueChange = (v: string) => {
    const h = hold.current;
    if (h && v !== h && visibleRef.current.has(h)) {
      reassert.current = h;
    }
    setValue(v);
  };
  useLayoutEffect(() => {
    visibleRef.current = visible;
    const h = reassert.current;
    if (h) {
      reassert.current = null;
      if (h !== value) {
        setValue(h);
        setScroll((s) => ({ block: s.block, key: s.key + 1 }));
      }
    }
  });
  // When the selected row leaves the list (a filter took it), the first row takes over. cmdk means to do this
  // itself, but it looks the old row up through a list ref that is detached at that moment.
  useLayoutEffect(() => {
    if (flatIds.length > 0 && !visible.has(value)) {
      setValue(flatIds[0]);
      setScroll((s) => ({ block: "nearest", key: s.key + 1 }));
    }
  }, [flatIds, visible, value]);
  useLayoutEffect(() => {
    if (open && !opening.initialQuery) {
      holdValue(value);
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- only on the opening itself
  }, [open]);

  // --- actions ---
  const dirOf = (id: string): -1 | 0 | 1 => {
    const a = flatIds.indexOf(current.id);
    const b = flatIds.indexOf(id);
    return a < 0 || b < 0 ? 0 : (Math.sign(b - a) as -1 | 0 | 1);
  };
  const pick = (m: ChatModel) => {
    if (m.id === current.id) {
      onOpenChange(false);
      return;
    }
    onPick(m, dirOf(m.id));
  };
  const toggleCap = (k: CapKey) => {
    keep();
    setCaps((cs) => (cs.includes(k) ? cs.filter((c) => c !== k) : [...cs, k]));
  };
  const clearCaps = () => {
    keep();
    setCaps([]);
  };
  const clickSort = (k: Exclude<SortKey, "maker">) => {
    keep();
    setSortAnim(true);
    setSort((s) => {
      if (s.key !== k) {
        return { dir: NATURAL[k], key: k };
      }
      return s.dir === NATURAL[k] ? { dir: s.dir === "asc" ? "desc" : "asc", key: k } : { dir: "asc", key: "maker" };
    });
  };
  const cycleSort = () => {
    keep();
    setSortAnim(false);
    setSort((s) => {
      const next = SORT_CYCLE[(SORT_CYCLE.indexOf(s.key) + 1) % SORT_CYCLE.length];
      return { dir: next === "maker" ? "asc" : NATURAL[next], key: next };
    });
  };
  const toggleFold = (key: string) => {
    const folding = !folded.has(key);
    const next = new Set(folded);
    if (folding) {
      next.add(key);
      // The selected row is in this group: the nearest visible row below takes over, else the one above.
      const at = sections.findIndex((s) => s.key === key);
      if (sections[at]?.entries.some((e) => e.m.id === value)) {
        const after = sections.slice(at + 1).find((s) => !next.has(s.key) || !s.heading)?.entries[0];
        const before = sections
          .slice(0, at)
          .reverse()
          .find((s) => !next.has(s.key) || !s.heading)
          ?.entries.at(-1);
        const target = after ?? before;
        if (target) {
          setValue(target.m.id);
          setScroll((sc) => ({ block: "nearest", key: sc.key + 1 }));
        }
      }
      setUnfolded(null);
    } else {
      next.delete(key);
      setUnfolded(key);
    }
    nav.current = "snap";
    setFolded(next);
  };
  const countWithout = (k: CapKey) =>
    build(
      query,
      caps.filter((c) => c !== k),
      sort,
      frozen
    ).sections.reduce((n, s) => n + s.entries.length, 0);

  // Stable callbacks for the memoized rows.
  const latest = useRef({ favorites, onClosed, opening, pick });
  useLayoutEffect(() => {
    latest.current = { favorites, onClosed, opening, pick };
  });
  const onSelectRow = useCallback((id: string) => {
    const m = anyModel(id);
    if (m) {
      latest.current.pick(m);
    }
  }, []);
  const onStarRow = useCallback((id: string) => latest.current.favorites.toggle(id), []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) {
      return;
    }
    const mod = e.metaKey || e.ctrlKey;
    // What moved the selection, written before cmdk handles the key: a lone arrow glides, the rest snaps.
    nav.current = (e.key === "ArrowDown" || e.key === "ArrowUp") && !e.repeat && !mod && !e.altKey && !e.shiftKey ? "step" : "snap";
    const digit = /^Digit(\d)$/u.exec(e.code)?.[1];
    const handled = () => {
      e.preventDefault();
      // The composer's form (our React parent through the portal) has its own ⌘1–9: do not pick twice.
      e.stopPropagation();
    };
    if (mod && !e.altKey && digit && digit !== "0") {
      handled();
      const m = anyModel(favorites.ids[Number(digit) - 1] ?? "");
      if (m) {
        pick(m);
      }
      return;
    }
    const starKey = (mod && !e.altKey && e.code === "KeyD") || (e.code === "Space" && !mod && !e.altKey && !e.shiftKey && query === "" && e.target === inputRef.current);
    if (starKey) {
      handled();
      const id = subject.id;
      const pinning = !favorites.has(id);
      favorites.toggle(id);
      if (pinning) {
        requestAnimationFrame(() => popStar(listRef.current?.querySelector<HTMLElement>(`[cmdk-item][data-value="${CSS.escape(id)}"]`) ?? null));
      }
      return;
    }
    if (e.altKey && !mod) {
      if (digit === "0") {
        handled();
        clearCaps();
        return;
      }
      const cap = digit ? CAPS[Number(digit) - 1] : undefined;
      if (cap) {
        handled();
        toggleCap(cap.key);
        return;
      }
      if (e.code === "KeyS") {
        handled();
        cycleSort();
        return;
      }
    }
    if (e.key === "Backspace" && !mod && e.target === inputRef.current && query === "" && caps.length > 0) {
      handled();
      keep();
      setCaps((cs) => cs.slice(0, -1));
      return;
    }
    // Enter on a focused key or header presses it (cmdk would otherwise pick the highlighted model).
    const target = e.target as HTMLElement;
    if (e.key === "Enter" && target !== inputRef.current && target.closest("button")) {
      e.preventDefault();
      target.closest("button")?.click();
    }
  };

  const onDialogChange = (next: boolean, details: { reason: string; cancel: () => void }) => {
    // The first Esc clears the query and filters, the second closes.
    if (!next && details.reason === "escape-key" && (query !== "" || caps.length > 0)) {
      details.cancel();
      setQuery("");
      setCaps([]);
      return;
    }
    onOpenChange(next);
  };

  const grow = open && opening.via === "mouse";
  const origin = grow && opening.origin && typeof window !== "undefined" ? originFrom(opening.origin) : undefined;

  return (
    <Dialog onOpenChange={onDialogChange} open={open}>
      <DialogPortal keepMounted>
        <DialogOverlay className={cn(OVERLAY, grow && OVERLAY_FADE)} />
        <DialogPopup
          className={cn(POPUP, grow && POPUP_GROW)}
          finalFocus={() => {
            // The composer puts the caret back where it was; Base UI must not move focus itself.
            const done = latest.current.onClosed;
            if (!done) {
              return true;
            }
            done();
            return false;
          }}
          initialFocus={() => {
            const el = inputRef.current;
            if (!el) {
              return true;
            }
            // A restored query comes back selected; a letter from the picker keeps the caret after it.
            const end = Boolean(latest.current.opening.initialQuery);
            const place = () => {
              if (end) {
                el.setSelectionRange(el.value.length, el.value.length);
              } else {
                el.select();
              }
            };
            el.addEventListener("focus", place, { once: true });
            setTimeout(() => el.removeEventListener("focus", place), 250);
            return el;
          }}
          render={(props) => (
            <Shown.Provider value={!props.hidden}>
              <div {...props} />
            </Shown.Provider>
          )}
          style={origin ? { transformOrigin: origin } : undefined}
        >
          <style>{Y_CSS + LOCAL_CSS}</style>
          <DialogTitle className="sr-only">Все модели</DialogTitle>
          <Command className="min-h-0 flex-1 rounded-none! bg-transparent p-0" label="Все модели" loop onKeyDown={onKeyDown} onValueChange={onValueChange} shouldFilter={false} value={value}>
            <div className="flex h-[52px] shrink-0 items-center gap-3 border-b px-4">
              <Search className="text-muted-foreground size-4 shrink-0" />
              <CommandInputBare
                className="caret-primary placeholder:text-muted-foreground h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none max-sm:text-base"
                onValueChange={setQuery}
                placeholder="Модель, производитель или источник"
                ref={inputRef}
                value={query}
              />
              {layout && <span className="text-muted-foreground shrink-0 text-xs">по раскладке: {layout}</span>}
              {filtering && (
                <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs tabular-nums">
                  {/* Rolls on filters and ⌫; a new key per query, so typing changes it without motion (№6). */}
                  <RollingCount key={query} value={flatIds.length} /> из {ALL_MODELS.length}
                </span>
              )}
              {/* Capability filters: quiet monochrome icons in the search row; the name and ⌥N in the tooltip */}
              <div aria-label="Только те, что умеют" className="flex shrink-0 items-center gap-0.5" role="group">
                {CAPS.map(({ key, icon: Icon, label }, i) => {
                  const on = caps.includes(key);
                  return (
                    <Tooltip key={key}>
                      <TooltipTrigger
                        aria-keyshortcuts={`Alt+${i + 1}`}
                        aria-label={`Только «${label}»`}
                        aria-pressed={on}
                        className={cn(
                          "flex size-7 items-center justify-center rounded-md outline-none active:scale-[0.94] focus-visible:ring-2 focus-visible:ring-ring/50",
                          "[transition:scale_160ms_cubic-bezier(0.23,1,0.32,1),background-color_150ms_ease,color_150ms_ease] motion-reduce:active:scale-100",
                          on ? "bg-foreground/[0.08] text-foreground" : "text-muted-foreground/70 hover:bg-muted hover:text-foreground"
                        )}
                        onClick={() => toggleCap(key)}
                        onMouseDown={prevent}
                        type="button"
                      >
                        <Icon className="size-4" />
                      </TooltipTrigger>
                      <TooltipContent>
                        Только «{label}» <Kbd>⌥{i + 1}</Kbd>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
              <span aria-hidden className="bg-border h-4 w-px shrink-0" />
              <DialogClose aria-label="Закрыть" className="shrink-0 rounded-sm outline-none" onMouseDown={prevent} tabIndex={-1}>
                <Kbd>esc</Kbd>
              </DialogClose>
            </div>

            <CommandList
              className="max-h-none min-h-0 flex-1 scroll-pt-[72px] overflow-y-auto overscroll-contain px-1.5 max-sm:order-2 [&>[cmdk-list-sizer]]:relative"
              label="Модели"
              onPointerMove={(e) => {
                const row = (e.target as HTMLElement).closest("[cmdk-item]");
                if (row && row.getAttribute("aria-selected") !== "true") {
                  nav.current = "step";
                }
              }}
              ref={listRef}
            >
              <Highlight nav={nav} present={visible.has(value)} rowsKey={rowsKey} scroll={scroll} value={value} />

              {/* Sticky column strip, translucent like the group headers: what each column is, sortable numbers. */}
              <div
                className={cn(
                  "text-muted-foreground sticky top-0 z-20 -mx-1.5 grid h-8 items-center gap-2 border-b border-border/50 px-3.5 text-[11px] font-medium tracking-wide uppercase",
                  "bg-muted/60 backdrop-blur-md supports-[backdrop-filter]:bg-muted/45 dark:bg-muted/50",
                  COLS
                )}
              >
                <span className="col-span-2">Модель</span>
                <span aria-hidden />
                {(
                  [
                    { key: "context", label: "Контекст" },
                    { key: "price", label: "Цена за 1M", narrow: true, tip: "вход / выход; сортируем по входу" },
                    { key: "latency", label: "Отклик", narrow: true, tip: "Время до первого токена, медиана по запускам в Metobe" },
                  ] as { key: Exclude<SortKey, "maker">; label: string; narrow?: boolean; tip?: string }[]
                ).map((h) => {
                  const active = sort.key === h.key;
                  const props = {
                    "aria-label": `${h.label}: сортировать`,
                    "aria-pressed": active,
                    className: cn(
                      "flex items-center justify-end gap-0.5 text-right whitespace-nowrap uppercase outline-none transition-colors duration-150 ease-[ease] hover:text-foreground focus-visible:text-foreground focus-visible:underline",
                      active ? "text-foreground" : "text-muted-foreground",
                      h.narrow && "@max-[640px]:hidden"
                    ),
                    onClick: () => clickSort(h.key),
                    onMouseDown: prevent,
                    type: "button" as const,
                  };
                  const inner = (
                    <>
                      {h.label}
                      {active && <ArrowDown aria-hidden className={cn("size-2.5 shrink-0", sortAnim && "yp-arrow", sort.dir === "asc" && "rotate-180")} />}
                    </>
                  );
                  return h.tip ? (
                    <Tooltip key={h.key}>
                      <TooltipTrigger {...props}>{inner}</TooltipTrigger>
                      <TooltipContent>{h.tip}</TooltipContent>
                    </Tooltip>
                  ) : (
                    <button key={h.key} {...props}>
                      {inner}
                    </button>
                  );
                })}
              </div>

              {sections.map((s) => {
                const fold = isFolded(s);
                const bare = s.heading?.kind === "maker";
                return (
                  <div key={s.key}>
                    {s.heading && <GroupHeader folded={fold} h={s.heading} onToggle={() => toggleFold(s.key)} />}
                    {!fold && (
                      <CommandGroup
                        // The same air above the first row and below the last, under a header or the column strip.
                        className={cn(GROUP, "py-1", unfolded === s.key && "animate-in fade-in duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]")}
                        value={s.key}
                      >
                        {s.entries.map(({ m, mask, sourceHit }) => {
                          const favIndex = favorites.ids.indexOf(m.id);
                          return (
                            <Row
                              bare={bare}
                              describedBy={inspectorId}
                              fav={favIndex >= 0}
                              favIndex={favIndex}
                              fresh={favIndex >= 0 && !frozen.includes(m.id)}
                              isCurrent={m.id === current.id}
                              key={m.id}
                              m={m}
                              mask={query.trim() ? mask : undefined}
                              onSelect={onSelectRow}
                              onStar={onStarRow}
                              over={contextTokens !== undefined && m.context !== null && contextTokens > m.context}
                              selected={m.id === value}
                              showSource={DUP_TITLES.has(m.title.toLowerCase()) || Boolean(sourceHit)}
                            />
                          );
                        })}
                      </CommandGroup>
                    )}
                  </div>
                );
              })}

              {ALL_MODELS.length === 0 ? (
                <p className="text-muted-foreground px-4 py-10 text-center text-sm">В чате пока нет моделей — их включает администратор</p>
              ) : (
                flatIds.length === 0 && sections.every((sec) => !isFolded(sec)) && (
                  <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
                    <p className="text-muted-foreground text-sm">{query.trim() ? `Ничего по «${query.trim()}»` : "Ничего с этими фильтрами"}</p>
                    {caps.length > 0 && (
                      <div className="flex flex-wrap justify-center gap-1.5">
                        {caps.map((k) => {
                          const n = countWithout(k);
                          const label = CAPS.find((c) => c.key === k)?.label;
                          return (
                            n > 0 && (
                              <Button key={k} onClick={() => toggleCap(k)} onMouseDown={prevent} size="xs" variant="outline">
                                Без «{label}» — {n}
                              </Button>
                            )
                          );
                        })}
                        <Button onClick={clearCaps} onMouseDown={prevent} size="xs" variant="ghost">
                          Сбросить фильтры <Kbd>⌥0</Kbd>
                        </Button>
                      </div>
                    )}
                  </div>
                )
              )}

              {/* The bottom edge fades out as the list reaches its end (scroll-driven, №8). */}
              <div aria-hidden className="y-edge from-popover pointer-events-none sticky bottom-0 -mx-1.5 -mt-4 h-4 bg-linear-to-t" />
            </CommandList>

            <PaletteBar contextTokens={contextTokens} current={current} hasImages={hasImages} id={inspectorId} m={subject} />
          </Command>
        </DialogPopup>
      </DialogPortal>
    </Dialog>
  );
};
