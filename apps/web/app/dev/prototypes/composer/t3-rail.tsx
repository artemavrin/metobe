"use client";

// «Рельс» (after T3 Code): a narrow rail on the left — favorites, then one tile per maker — and the list on the
// right: name, maker and source, a check on the current one, ⌘1–9 on the first nine, a star. Typing drops the
// rail and groups results by maker. Keyboard all the way: arrows, Enter, ⌘1–9.
import { Kbd } from "@metobe/ui/components/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import { Check, Search, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { BrandLogo } from "@/components/brand-logo";

import { type ChatModel, MODELS, modelById } from "./data";
import { EASE } from "./shared";
import { CapBadges, type PickerProps } from "./t3-kit";

const MAKERS = [...new Map(MODELS.map((m) => [m.maker, m.makerTitle])).entries()];

export const PickerRail = ({ current, onPick, favorites }: PickerProps & { close: () => void }) => {
  const [tab, setTab] = useState<string>("fav");
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const searching = q.trim().length > 0;

  const list: ChatModel[] = useMemo(() => {
    if (searching) {
      const needle = q.trim().toLowerCase();
      return MODELS.filter((m) => `${m.title} ${m.makerTitle} ${m.source}`.toLowerCase().includes(needle));
    }
    return tab === "fav" ? favorites.ids.map(modelById) : MODELS.filter((m) => m.maker === tab);
  }, [searching, q, tab, favorites.ids]);

  // ⌘1–9 take the n-th visible row while the picker is open — a keyboard action, so no motion on the choice.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if ((e.metaKey || e.ctrlKey) && n >= 1 && n <= 9 && list[n - 1]) {
        e.preventDefault();
        onPick(list[n - 1] as ChatModel);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [list, onPick]);

  const groups: [string, ChatModel[]][] = searching
    ? MAKERS.map(([slug, title]) => [title, list.filter((m) => m.maker === slug)] as [string, ChatModel[]]).filter(([, ms]) => ms.length > 0)
    : [["", list]];
  let index = -1;

  return (
    <div className="flex h-[min(26rem,calc(var(--available-height)-1rem))] w-[30rem] max-w-[calc(100vw-2rem)]">
      {!searching && (
        <nav aria-label="Группы моделей" className="flex w-12 shrink-0 flex-col items-center gap-1 border-r py-2">
          {[["fav", "Избранное"] as const, ...MAKERS].map(([id, title], i) => (
            <Tooltip key={id}>
              <TooltipTrigger
                render={
                  <button
                    aria-current={tab === id}
                    className={cn("relative flex size-9 items-center justify-center rounded-lg transition-colors duration-150", tab === id ? "bg-accent" : "hover:bg-accent/60", i === 0 && "mb-1")}
                    onClick={() => {
                      setTab(id);
                      setActive(0);
                    }}
                    type="button"
                  />
                }
              >
                {tab === id && <span className={cn("bg-primary absolute top-1.5 bottom-1.5 -left-1.5 w-0.5 rounded-full", EASE)} />}
                {id === "fav" ? <Star className="size-4 fill-current" /> : <BrandLogo label={title} logo={id} size={22} tile={false} />}
              </TooltipTrigger>
              <TooltipContent side="right">{title}</TooltipContent>
            </Tooltip>
          ))}
        </nav>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <label className="mx-2 flex items-center gap-2 border-b px-1">
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
                onPick(list[active] as ChatModel);
              }
            }}
            placeholder="Найти модель"
            value={q}
          />
        </label>
        <div className="flex-1 overflow-y-auto p-1.5" role="listbox">
          {list.length === 0 && <p className="text-muted-foreground px-2 py-10 text-center text-sm">{searching ? "Такой модели нет в чате" : "Звёздочкой отмечайте модели в группах слева"}</p>}
          {groups.map(([title, ms]) => (
            <div key={title || "list"}>
              {title && (
                <p className="text-muted-foreground flex items-center gap-1.5 px-2 pt-2 pb-1 text-xs">
                  <BrandLogo label={title} logo={ms[0]?.maker} size={14} tile={false} /> {title}
                </p>
              )}
              {ms.map((m) => {
                index += 1;
                const i = index;
                const fav = favorites.has(m.id);
                return (
                  <div
                    aria-selected={i === active}
                    className={cn("group flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2", i === active && "bg-accent")}
                    key={m.id}
                    onClick={() => onPick(m)}
                    onMouseMove={() => setActive(i)}
                    role="option"
                    tabIndex={-1}
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-sm">{m.title}</span>
                      <span className="text-muted-foreground flex items-center gap-1.5 truncate text-xs">
                        <BrandLogo label={m.makerTitle} logo={m.maker} size={14} tile={false} /> {m.source}
                      </span>
                    </span>
                    <CapBadges m={m} size="xs" />
                    {m.id === current.id && <Check className="size-4" />}
                    {i < 9 && <Kbd className="w-8 justify-center">⌘{i + 1}</Kbd>}
                    <button
                      aria-label={fav ? "Убрать из избранного" : "В избранное"}
                      aria-pressed={fav}
                      className={cn("flex size-6 items-center justify-center rounded-md transition-[color,transform] duration-150 active:scale-90", fav ? "text-amber-500" : "text-muted-foreground/50 hover:text-foreground")}
                      onClick={(e) => {
                        e.stopPropagation();
                        favorites.toggle(m.id);
                      }}
                      type="button"
                    >
                      <Star className={cn("size-4", fav && "fill-current")} />
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
