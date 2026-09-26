"use client";

// The model picker: favorites (T3) + palette. Left — search, capability filters in colour, «Избранное» first with
// ⌘1–9, then every maker; single-line rows. Right — the highlighted model in full: context and prices as big
// numbers, capabilities in words, the source, «Выбрать» and «В избранное». Keyboard: arrows, Enter, ⌘1–9, Esc.
// What was off in the round-1 palette: two-line rows with a crammed right edge, a duplicated «Недавние», a detail
// card with a long label column and an empty bottom half, a search box inside a box. All reworked here.
import { Button } from "@metobe/ui/components/button";
import { Kbd } from "@metobe/ui/components/kbd";
import { Badge } from "@metobe/ui/components/reui/badge";
import { cn } from "@metobe/ui/lib/utils";
import { Brain, Check, Eye, Search, Star, Wrench } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { BrandLogo } from "@/components/brand-logo";

import { type ChatModel, DEFAULT_MODEL, fmtContext, MODELS, modelById } from "./data";
import { EASE } from "./shared";
import type { Favorites } from "./t3-kit";

const CAPS = [
  { chip: "bg-muted text-foreground/80", icon: Eye, key: "vision", label: "Картинки", long: "Видит картинки" },
  { chip: "bg-muted text-foreground/80", icon: Wrench, key: "tools", label: "Инструменты", long: "Работает с инструментами" },
  { chip: "bg-muted text-foreground/80", icon: Brain, key: "reasoning", label: "Размышления", long: "Умеет размышлять" },
] as const;
type CapKey = (typeof CAPS)[number]["key"];

const money = (m: ChatModel, v?: number) => (v === undefined ? null : `${m.price?.currency === "USD" ? "$" : "₽"}${v}`);

/** Compact capability icons for a row: only what the model can; dashed — the source did not say. */
const RowCaps = ({ m }: { m: ChatModel }) => (
  <span className="flex items-center gap-0.5">
    {CAPS.map(({ key, icon: Icon }) =>
      m.caps[key] === false ? null : (
        <span className={cn("flex size-5 items-center justify-center", m.caps[key] ? "text-foreground/55" : "text-foreground/25")} key={key} title={m.caps[key] ? undefined : "не проверено"}>
          <Icon className="size-3.5" />
        </span>
      )
    )}
  </span>
);

const Detail = ({ m, favorites, current, onPick }: { m: ChatModel; favorites: Favorites; current: boolean; onPick: () => void }) => {
  const fav = favorites.has(m.id);
  return (
    <div className={cn("animate-in fade-in flex h-full flex-col duration-150", EASE)} key={m.id}>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between">
          <BrandLogo label={m.makerTitle} logo={m.maker} size={40} />
          <span className="flex gap-1">
            {m.id === DEFAULT_MODEL && (
              <Badge size="sm" variant="primary-light">
                по умолчанию
              </Badge>
            )}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <h3 className="text-base font-semibold tracking-tight">{m.title}</h3>
          <p className="text-muted-foreground text-xs">
            {m.makerTitle} · через {m.source}
          </p>
        </div>
      </div>

      {/* The three numbers people compare, big and aligned */}
      <dl className="grid grid-cols-3 border-y">
        {[
          ["Контекст", fmtContext(m.context) ?? "—", "токенов"],
          ["Вход", money(m, m.price?.input) ?? "—", "за 1M"],
          ["Выход", money(m, m.price?.output) ?? "—", "за 1M"],
        ].map(([k, v, unit], i) => (
          <div className={cn("flex flex-col gap-0.5 px-4 py-3", i > 0 && "border-l")} key={k}>
            <dt className="text-muted-foreground text-[11px]">{k}</dt>
            <dd className="text-base font-semibold tabular-nums">{v}</dd>
            <dd className="text-muted-foreground text-[11px]">{unit}</dd>
          </div>
        ))}
      </dl>

      <ul className="flex flex-col gap-2 p-4 text-sm">
        {CAPS.map(({ key, icon: Icon, chip, long }) => {
          const v = m.caps[key];
          return (
            <li className={cn("flex items-center gap-2.5", v === false && "text-muted-foreground")} key={key}>
              <span className={cn("flex size-6 items-center justify-center rounded-md", v === true ? chip : "bg-muted text-muted-foreground")}>
                <Icon className="size-3.5" />
              </span>
              <span className="flex-1">{long}</span>
              <span className="text-muted-foreground text-xs">{v === true ? "да" : v === false ? "нет" : "не проверено"}</span>
            </li>
          );
        })}
        {m.price?.cacheRead !== undefined && (
          <li className="text-muted-foreground mt-1 text-xs">Из кэша — {money(m, m.price.cacheRead)} за 1M: длинные чаты дешевле</li>
        )}
      </ul>

      <div className="mt-auto flex gap-2 border-t p-3">
        <Button className="flex-1" onClick={onPick} size="sm">
          {current ? (
            <>
              <Check /> Выбрана
            </>
          ) : (
            <>
              Выбрать <Kbd className="bg-primary-foreground/20 text-primary-foreground ml-1">↵</Kbd>
            </>
          )}
        </Button>
        <Button aria-pressed={fav} className={cn(fav && "text-foreground")} onClick={() => favorites.toggle(m.id)} size="sm" variant="outline">
          <Star className={cn("star-pop", fav && "fill-current")} key={String(fav)} /> {fav ? "В избранном" : "В избранное"}
        </Button>
      </div>
    </div>
  );
};

const PICKER_CSS = `
@keyframes star-pop { 0% { transform: scale(0.8) } 60% { transform: scale(1.18) } 100% { transform: scale(1) } }
.star-pop { animation: star-pop 260ms cubic-bezier(0.23, 1, 0.32, 1) }
@media (prefers-reduced-motion: reduce) { .star-pop { animation: none } }
`;

export const PalettePicker = ({ current, onPick, favorites, className }: { current: ChatModel; onPick: (m: ChatModel) => void; favorites: Favorites; className?: string }) => {
  const [q, setQ] = useState("");
  const [caps, setCaps] = useState<CapKey[]>([]);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const searching = q.trim().length > 0 || caps.length > 0;

  const sections = useMemo(() => {
    const ok = (m: ChatModel) => caps.every((k) => m.caps[k] === true) && `${m.title} ${m.makerTitle} ${m.source} ${m.id}`.toLowerCase().includes(q.trim().toLowerCase());
    const favs = favorites.ids.map(modelById).filter(ok);
    const rest = MODELS.filter((m) => ok(m) && !favorites.has(m.id));
    const makers = [...new Set(rest.map((m) => m.makerTitle))];
    return [
      { models: favs, title: "Избранное" },
      ...makers.map((mk) => ({ models: rest.filter((m) => m.makerTitle === mk), title: mk })),
    ].filter((s) => s.models.length > 0);
  }, [q, caps, favorites]);
  const flat = sections.flatMap((s) => s.models);
  const favCount = favorites.ids.length;

  // Start on the current model, so Enter keeps it and the card shows it.
  useEffect(() => {
    const i = flat.findIndex((m) => m.id === current.id);
    setActive(i >= 0 ? i : 0);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- only on open
  }, []);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const highlighted = flat[active] ?? current;

  const onKeyDown = (e: React.KeyboardEvent) => {
    const n = Number(e.key);
    if ((e.metaKey || e.ctrlKey) && n >= 1 && n <= 9) {
      const fav = favorites.ids[n - 1];
      if (fav) {
        e.preventDefault();
        onPick(modelById(fav));
      }
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a + (e.key === "ArrowDown" ? 1 : flat.length - 1)) % Math.max(flat.length, 1));
    } else if (e.key === "Enter" && flat[active]) {
      e.preventDefault();
      onPick(flat[active]);
    }
  };

  let index = -1;
  return (
    <div className={cn("flex h-[min(30rem,calc(var(--available-height)-1rem))] w-[min(46rem,calc(100vw-2rem))]", className)} onKeyDown={onKeyDown}>
      <style>{PICKER_CSS}</style>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-col gap-2 border-b px-3 pt-3 pb-2.5">
          <label className="flex items-center gap-2">
            <Search className="text-muted-foreground size-4 shrink-0" />
            <input
              autoFocus
              className="placeholder:text-muted-foreground h-7 flex-1 bg-transparent text-sm outline-none"
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              placeholder="Модель, производитель или источник"
              value={q}
            />
            <Kbd>esc</Kbd>
          </label>
          <div className="flex gap-1.5" role="group" aria-label="Только те, что умеют">
            {CAPS.map(({ key, icon: Icon, label, chip }) => {
              const on = caps.includes(key);
              return (
                <button
                  aria-pressed={on}
                  className={cn(
                    "flex h-6 items-center gap-1 rounded-full border px-2 text-xs transition-[background-color,border-color,color] duration-150 active:scale-[0.97]",
                    on ? "bg-foreground text-background border-transparent" : "text-muted-foreground hover:text-foreground hover:border-foreground/20"
                  )}
                  key={key}
                  onClick={() => {
                    setCaps(on ? caps.filter((c) => c !== key) : [...caps, key]);
                    setActive(0);
                  }}
                  type="button"
                >
                  <Icon className="size-3" /> {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-1.5" ref={listRef} role="listbox">
          {sections.length === 0 && (
            <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-1 text-sm">
              <span>Такой модели нет в чате</span>
              <span className="text-xs">Модели включает администратор в настройках</span>
            </div>
          )}
          {sections.map((s) => (
            <div className="mb-1" key={s.title}>
              <p className="text-muted-foreground flex items-center gap-1.5 px-2 pt-2 pb-1 text-[11px] font-medium tracking-wide uppercase">
                {s.title === "Избранное" && <Star className="size-3 fill-current" />}
                {s.title}
              </p>
              {s.models.map((m) => {
                index += 1;
                const i = index;
                const favIndex = favorites.ids.indexOf(m.id);
                return (
                  <div
                    aria-selected={i === active}
                    className={cn("group flex h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2", i === active && "bg-accent")}
                    data-index={i}
                    key={m.id}
                    onClick={() => onPick(m)}
                    onMouseMove={() => setActive(i)}
                    role="option"
                    tabIndex={-1}
                  >
                    <BrandLogo label={m.makerTitle} logo={m.maker} size={22} />
                    <span className="min-w-0 flex-1 truncate text-sm">{m.title}</span>
                    {m.id === current.id && <Check className="text-primary size-4 shrink-0" />}
                    <RowCaps m={m} />
                    {!searching && favIndex >= 0 && favIndex < 9 && <Kbd className="hidden w-7 justify-center sm:flex">⌘{favIndex + 1}</Kbd>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="text-muted-foreground flex items-center gap-3 border-t px-3 py-2 text-[11px]">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> выбрать
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> взять
          </span>
          {favCount > 0 && (
            <span className="hidden items-center gap-1 sm:flex">
              <Kbd>⌘1–{Math.min(favCount, 9)}</Kbd> избранное
            </span>
          )}
        </div>
      </div>

      <aside className="bg-muted/30 hidden w-72 shrink-0 border-l md:block">
        <Detail current={highlighted.id === current.id} favorites={favorites} m={highlighted} onPick={() => onPick(highlighted)} />
      </aside>
    </div>
  );
};
