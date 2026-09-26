"use client";

// The everyday picker: small, search on top, the user's favorites with ⌘1–9, and «Показать все» at the bottom,
// which opens the full palette (list + the model's card). Typing searches every model right here, so the palette
// is for comparing, not for finding.
import { Kbd } from "@metobe/ui/components/kbd";
import { cn } from "@metobe/ui/lib/utils";
import { Check, ChevronRight, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { BrandLogo } from "@/components/brand-logo";

import { type ChatModel, MODELS, modelById } from "./data";
import type { Favorites } from "./t3-kit";

export const QuickPicker = ({
  current,
  onPick,
  favorites,
  onShowAll,
}: {
  current: ChatModel;
  onPick: (m: ChatModel) => void;
  favorites: Favorites;
  onShowAll: () => void;
}) => {
  const [q, setQ] = useState("");
  const searching = q.trim().length > 0;
  const list = useMemo(() => {
    if (!searching) {
      return favorites.ids.map(modelById);
    }
    const needle = q.trim().toLowerCase();
    return MODELS.filter((m) => `${m.title} ${m.makerTitle} ${m.source}`.toLowerCase().includes(needle));
  }, [searching, q, favorites.ids]);
  const [active, setActive] = useState(() => Math.max(0, list.findIndex((m) => m.id === current.id)));
  // The last row is «Показать все», reachable with the arrows too.
  const rows = list.length + 1;

  const onKeyDown = (e: React.KeyboardEvent) => {
    const n = Number(e.key);
    if ((e.metaKey || e.ctrlKey) && n >= 1 && n <= 9 && !searching && list[n - 1]) {
      e.preventDefault();
      onPick(list[n - 1] as ChatModel);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a + (e.key === "ArrowDown" ? 1 : rows - 1)) % rows);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active === list.length) {
        onShowAll();
      } else if (list[active]) {
        onPick(list[active] as ChatModel);
      }
    }
  };

  return (
    <div className="flex w-72 flex-col" onKeyDown={onKeyDown}>
      <label className="flex items-center gap-2 border-b px-3">
        <Search className="text-muted-foreground size-4 shrink-0" />
        <input
          autoFocus
          className="placeholder:text-muted-foreground h-10 flex-1 bg-transparent text-sm outline-none"
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          placeholder="Найти модель"
          value={q}
        />
      </label>
      <div className="max-h-[min(18rem,calc(var(--available-height)-6rem))] overflow-y-auto p-1" role="listbox">
        {!searching && list.length > 0 && <p className="text-muted-foreground px-2 pt-1.5 pb-1 text-[11px] font-medium tracking-wide uppercase">Избранное</p>}
        {list.length === 0 && (
          <p className="text-muted-foreground px-3 py-6 text-center text-sm">{searching ? "Такой модели нет в чате" : "Избранного пока нет — отметьте модели в «Показать все»"}</p>
        )}
        {list.map((m, i) => (
          <div
            aria-selected={i === active}
            className={cn("flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm", i === active && "bg-accent")}
            key={m.id}
            onClick={() => onPick(m)}
            onMouseMove={() => setActive(i)}
            role="option"
            tabIndex={-1}
          >
            <BrandLogo label={m.makerTitle} logo={m.maker} size={20} />
            <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
              <span className="truncate">{m.title}</span>
              {searching && <span className="text-muted-foreground truncate text-xs">{m.source}</span>}
            </span>
            {m.id === current.id && <Check className="size-4 shrink-0" />}
            {!searching && i < 9 && <Kbd className="w-7 justify-center">⌘{i + 1}</Kbd>}
          </div>
        ))}
      </div>
      <button
        className={cn("text-muted-foreground hover:text-foreground flex h-10 items-center gap-2 border-t px-3 text-sm transition-colors", active === list.length && "bg-accent text-foreground")}
        onClick={onShowAll}
        onMouseMove={() => setActive(list.length)}
        type="button"
      >
        <span className="flex-1 text-left">Показать все · {MODELS.length}</span>
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
};
