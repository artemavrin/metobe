"use client";

// «Режимы + избранное»: the T3 picker with the modes on top — three tiles the admin set up (Быстро / Обычно /
// Глубоко → a model each), then the user's own pins, then «Все модели». Modes for people who do not care, the list
// for those who do, one popover for both.
import { cn } from "@metobe/ui/lib/utils";
import { useState } from "react";

import { BrandLogo } from "@/components/brand-logo";

import { MODES, modelById } from "./data";
import { ModeIcon } from "./modes-kit";
import { PickerFavoritesGrid, PickerList } from "./t3-grid";
import type { PickerProps } from "./t3-kit";

const ModeTiles = ({ current, onPick }: Pick<PickerProps, "current" | "onPick">) => (
  <div className="grid grid-cols-3 gap-1.5 border-b p-1.5" role="radiogroup" aria-label="Режимы">
    {MODES.map((m) => {
      const model = modelById(m.model);
      const on = model.id === current.id;
      return (
        <button
          aria-checked={on}
          className={cn(
            "flex flex-col gap-1.5 rounded-lg border p-2 text-left transition-[background-color,border-color,transform] duration-150 active:scale-[0.98]",
            on ? "border-primary/40 bg-primary/5" : "hover:bg-accent/60 border-transparent"
          )}
          key={m.id}
          onClick={() => onPick(model)}
          role="radio"
          type="button"
        >
          <span className="flex items-center gap-1.5 text-sm font-medium [&_svg]:size-3.5">
            <ModeIcon id={m.id} /> {m.title}
          </span>
          <span className="text-muted-foreground flex items-center gap-1 truncate text-[11px]">
            <BrandLogo label={model.makerTitle} logo={model.maker} size={12} tile={false} /> {model.title}
          </span>
        </button>
      );
    })}
  </div>
);

export const PickerModes = (p: PickerProps & { close: () => void }) => {
  const [all, setAll] = useState(false);
  if (all) {
    return <PickerFavoritesGrid {...p} startAll />;
  }
  return (
    <div className="w-[26rem] max-w-[calc(100vw-2rem)]">
      <PickerList {...p} header={<ModeTiles current={p.current} onPick={p.onPick} />} onShowAll={() => setAll(true)} />
    </div>
  );
};
