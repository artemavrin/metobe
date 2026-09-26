"use client";

// «Избранное → все» (after T3 Chat): the picker opens small — search and the user's pinned models with their
// capabilities in colour. «Все модели» turns it into a wide grid of cards grouped by maker, where anything can be
// pinned; a filter keeps only models that can see, use tools or think. Typing searches everything at once.
import { Button } from "@metobe/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@metobe/ui/components/popover";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowLeft, Check, LayoutGrid, ListFilter, Search, Star } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { BrandLogo } from "@/components/brand-logo";

import { type ChatModel, fmtContext, MODELS, modelById } from "./data";
import { EASE } from "./shared";
import { CAP_FILTERS, CapBadges, type Favorites, type PickerProps } from "./t3-kit";

type CapKey = (typeof CAP_FILTERS)[number]["key"];

const matches = (m: ChatModel, q: string, caps: CapKey[]) =>
  caps.every((k) => m.caps[k] === true) && `${m.title} ${m.makerTitle} ${m.source} ${m.id}`.toLowerCase().includes(q.trim().toLowerCase());

const StarButton = ({ id, favorites, className }: { id: string; favorites: Favorites; className?: string }) => {
  const on = favorites.has(id);
  return (
    <button
      aria-label={on ? "Убрать из избранного" : "В избранное"}
      aria-pressed={on}
      className={cn(
        "flex size-6 items-center justify-center rounded-md transition-[color,opacity,transform] duration-150 active:scale-90",
        on ? "text-amber-500" : "text-muted-foreground/60 hover:text-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
        className
      )}
      onClick={(e) => {
        e.stopPropagation();
        favorites.toggle(id);
      }}
      type="button"
    >
      <Star className={cn("size-3.5", on && "fill-current")} />
    </button>
  );
};

/** One row: logo, name with maker and source, capabilities, the star; the current model gets a check. */
export const ModelRow = ({ m, active, current, favorites, onPick, onHover }: { m: ChatModel; active: boolean; current: boolean; favorites: Favorites; onPick: () => void; onHover: () => void }) => (
  <div
    aria-selected={active}
    className={cn("group flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5", active && "bg-accent")}
    onClick={onPick}
    onMouseMove={onHover}
    role="option"
    tabIndex={-1}
  >
    <BrandLogo label={m.makerTitle} logo={m.maker} size={28} />
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="flex items-center gap-1.5 truncate text-sm">
        {m.title}
        {current && <Check className="text-primary size-3.5" />}
      </span>
      <span className="text-muted-foreground truncate text-xs">
        {m.makerTitle} · {m.source}
      </span>
    </span>
    <CapBadges m={m} size="xs" />
    <StarButton favorites={favorites} id={m.id} />
  </div>
);

const Card = ({ m, current, favorites, onPick }: { m: ChatModel; current: boolean; favorites: Favorites; onPick: () => void }) => (
  <div
    className={cn(
      "group bg-background relative flex cursor-pointer flex-col gap-2 rounded-xl border p-3 text-left transition-[border-color,box-shadow,transform] duration-150 hover:shadow-sm active:scale-[0.98]",
      current ? "border-primary ring-primary/20 ring-2" : "hover:border-foreground/20"
    )}
    onClick={onPick}
    onKeyDown={(e) => e.key === "Enter" && onPick()}
    role="option"
    aria-selected={current}
    tabIndex={0}
  >
    <StarButton className="absolute top-2 right-2" favorites={favorites} id={m.id} />
    <BrandLogo label={m.makerTitle} logo={m.maker} size={32} />
    <span className="flex flex-col">
      <span className="truncate text-sm font-medium">{m.title}</span>
      <span className="text-muted-foreground truncate text-xs">{m.source}</span>
    </span>
    <span className="mt-auto flex items-center justify-between">
      <CapBadges m={m} size="xs" />
      <span className="text-muted-foreground text-[11px] tabular-nums">{fmtContext(m.context)}</span>
    </span>
  </div>
);

const Filter = ({ caps, setCaps }: { caps: CapKey[]; setCaps: (c: CapKey[]) => void }) => (
  <Popover>
    <PopoverTrigger render={<Button className={cn("h-7 gap-1.5", caps.length > 0 && "text-primary")} size="xs" variant="ghost" />}>
      <ListFilter className="size-3.5" /> {caps.length > 0 ? `Фильтр · ${caps.length}` : "Фильтр"}
    </PopoverTrigger>
    <PopoverContent align="end" className="w-52 gap-1 p-1.5" side="top">
      <p className="text-muted-foreground px-1.5 py-1 text-xs">Только те, что умеют</p>
      {CAP_FILTERS.map(({ key, label, icon: Icon, cls }) => {
        const on = caps.includes(key);
        return (
          <button
            aria-pressed={on}
            className="hover:bg-accent flex items-center gap-2 rounded-md px-1.5 py-1.5 text-sm transition-colors"
            key={key}
            onClick={() => setCaps(on ? caps.filter((c) => c !== key) : [...caps, key])}
            type="button"
          >
            <span className={cn("flex size-5 items-center justify-center rounded-md", cls)}>
              <Icon className="size-3" />
            </span>
            <span className="flex-1 text-left">{label}</span>
            {on && <Check className="size-3.5" />}
          </button>
        );
      })}
    </PopoverContent>
  </Popover>
);

/** The small list: favorites, or search results over everything. Arrows move, Enter takes. */
export const PickerList = ({
  current,
  onPick,
  favorites,
  header,
  onShowAll,
}: PickerProps & { header?: React.ReactNode; onShowAll?: () => void }) => {
  const [q, setQ] = useState("");
  const [caps, setCaps] = useState<CapKey[]>([]);
  const [active, setActive] = useState(0);
  const list = useMemo(() => {
    const pool = q.trim() || caps.length > 0 ? MODELS : favorites.ids.map(modelById);
    return pool.filter((m) => matches(m, q, caps));
  }, [q, caps, favorites.ids]);
  const listRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex flex-col">
      <label className="flex items-center gap-2 border-b px-3">
        <Search className="text-muted-foreground size-4" />
        <input
          autoFocus
          className="placeholder:text-muted-foreground h-11 flex-1 bg-transparent text-sm outline-none"
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a + (e.key === "ArrowDown" ? 1 : list.length - 1)) % Math.max(list.length, 1));
            } else if (e.key === "Enter" && list[active]) {
              e.preventDefault();
              onPick(list[active]);
            }
          }}
          placeholder="Найти модель"
          value={q}
        />
      </label>
      {header && !q.trim() && caps.length === 0 && header}
      <div className="max-h-[min(20rem,calc(var(--available-height)-8rem))] overflow-y-auto p-1.5" ref={listRef} role="listbox">
        {!q.trim() && caps.length === 0 && <p className="text-muted-foreground px-2 pt-1 pb-1.5 text-xs">Избранное</p>}
        {list.length === 0 ? (
          <p className="text-muted-foreground px-2 py-8 text-center text-sm">{q ? "Такой модели нет в чате" : "Звёздочкой отмечайте модели в «Все модели»"}</p>
        ) : (
          list.map((m, i) => <ModelRow active={i === active} current={m.id === current.id} favorites={favorites} key={m.id} m={m} onHover={() => setActive(i)} onPick={() => onPick(m)} />)
        )}
      </div>
      <div className="flex items-center justify-between border-t px-1.5 py-1.5">
        {onShowAll ? (
          <Button className="h-7 gap-1.5" onClick={onShowAll} size="xs" variant="ghost">
            <LayoutGrid className="size-3.5" /> Все модели · {MODELS.length}
          </Button>
        ) : (
          <span />
        )}
        <Filter caps={caps} setCaps={setCaps} />
      </div>
    </div>
  );
};

/** The wide grid: favorites first, then every maker; pins change right here. */
const PickerGrid = ({ current, onPick, favorites, onBack }: PickerProps & { onBack: () => void }) => {
  const [q, setQ] = useState("");
  const [caps, setCaps] = useState<CapKey[]>([]);
  const shown = MODELS.filter((m) => matches(m, q, caps));
  const groups = [
    ["Избранное", shown.filter((m) => favorites.has(m.id))],
    ...[...new Set(shown.map((m) => m.makerTitle))].map((maker) => [maker, shown.filter((m) => m.makerTitle === maker && !favorites.has(m.id))] as const),
  ].filter(([, ms]) => ms.length > 0) as [string, ChatModel[]][];

  return (
    <div className={cn("animate-in fade-in flex flex-col duration-150", EASE)}>
      <div className="flex items-center gap-2 border-b px-2">
        <Button aria-label="Назад к избранному" onClick={onBack} size="icon-sm" variant="ghost">
          <ArrowLeft />
        </Button>
        <Search className="text-muted-foreground size-4" />
        <input
          autoFocus
          className="placeholder:text-muted-foreground h-11 flex-1 bg-transparent text-sm outline-none"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && shown[0]) {
              e.preventDefault();
              onPick(shown[0]);
            }
          }}
          placeholder="Найти среди всех моделей"
          value={q}
        />
      </div>
      <div className="max-h-[min(26rem,calc(var(--available-height)-7rem))] overflow-y-auto p-3">
        {groups.length === 0 && <p className="text-muted-foreground py-10 text-center text-sm">Ничего не нашлось</p>}
        {groups.map(([title, ms]) => (
          <section className="mb-4 last:mb-0" key={title}>
            <h3 className="text-muted-foreground mb-2 px-0.5 text-xs">{title}</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="listbox">
              {ms.map((m) => (
                <Card current={m.id === current.id} favorites={favorites} key={m.id} m={m} onPick={() => onPick(m)} />
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className="flex items-center justify-between border-t px-3 py-1.5">
        <span className="text-muted-foreground text-xs">Звёздочка — в избранное, оно откроется первым</span>
        <Filter caps={caps} setCaps={setCaps} />
      </div>
    </div>
  );
};

/** Small by default, wide on «Все модели». The popover follows the content's width. */
export const PickerFavoritesGrid = ({ startAll = false, ...p }: PickerProps & { close: () => void; startAll?: boolean }) => {
  const [all, setAll] = useState(startAll);
  return <div className={all ? "w-[min(46rem,calc(100vw-2rem))]" : "w-[26rem] max-w-[calc(100vw-2rem)]"}>{all ? <PickerGrid {...p} onBack={() => setAll(false)} /> : <PickerList {...p} onShowAll={() => setAll(true)} />}</div>;
};
