"use client";

// «В кнопке»: the mode is part of sending. The field stays as clean as «Строка» — chips only once something is
// brought in — and the send button carries the mode: its icon on the button, the mode's name next to it, a menu
// from the chevron (⌘1–3 while typing). «Своя модель» is the last item of that same menu.
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@metobe/ui/components/dropdown-menu";
import { InputGroupButton } from "@metobe/ui/components/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@metobe/ui/components/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import { Check, ChevronDown, Paperclip, SlidersHorizontal } from "lucide-react";
import { useState } from "react";

import { BrandLogo } from "@/components/brand-logo";

import { MODES, modelById } from "./data";
import { AddMenu, ModeIcon, ModesField, modeShortcut, useModesComposer } from "./modes-kit";
import { type ComposerProps, EASE, Hint, Kbd, ModelList } from "./shared";

export const ComposerModesSend = (p: ComposerProps) => {
  const [picking, setPicking] = useState(false);
  const c = useModesComposer({ ...p, initialConnections: [], onHotkey: () => setPicking(true) });
  const label = c.manual ? c.model.title : c.current.title;
  const empty = !c.text.trim();

  const bar = (
    <>
      <span className="flex items-center gap-0.5">
        <AddMenu c={c} className="size-6 p-0" />
        <Tooltip>
          <TooltipTrigger render={<InputGroupButton aria-label="Прикрепить файл" onClick={c.files.open} size="icon-xs" variant="ghost" />}>
            <Paperclip />
          </TooltipTrigger>
          <TooltipContent>Прикрепить файл</TooltipContent>
        </Tooltip>
        <Hint>
          <Kbd>/</Kbd> скиллы <Kbd>@</Kbd> подключения
        </Hint>
      </span>

      {/* The split send button: the mode on the left half, the menu on the chevron */}
      <span className="ml-auto flex items-center">
        <span className="bg-primary text-primary-foreground flex h-8 items-center rounded-full shadow-xs">
          {p.streaming ? (
            <button
              aria-label="Остановить (Esc)"
              className="flex h-8 items-center gap-2 rounded-full px-3 text-xs font-medium transition-transform duration-150 active:scale-[0.97]"
              onClick={p.onStop}
              type="button"
            >
              <span className="size-2.5 rounded-[2px] bg-current" /> Стоп
            </button>
          ) : (
            <>
              <button
                aria-label={`Отправить — ${label}`}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-l-full pr-2 pl-3 text-xs font-medium transition-[opacity,transform] duration-150 active:scale-[0.97]",
                  empty && "opacity-60"
                )}
                aria-disabled={empty}
                type="submit"
              >
                {c.manual ? (
                  <BrandLogo label={c.model.makerTitle} logo={c.model.maker} size={14} tile={false} />
                ) : (
                  <ModeIcon className={cn("size-3.5 transition-transform duration-200", EASE)} id={c.current.id} key={c.current.id} />
                )}
                <span className={cn("animate-in fade-in duration-150", EASE)} key={label}>
                  {label}
                </span>
              </button>
              <span aria-hidden className="bg-primary-foreground/25 h-4 w-px" />
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      aria-label="Режим"
                      className="flex h-8 items-center rounded-r-full pr-2.5 pl-1.5 transition-transform duration-150 active:scale-[0.97]"
                      type="button"
                    />
                  }
                >
                  <ChevronDown className="size-3.5 opacity-80" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80" side="top">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Как отвечать</DropdownMenuLabel>
                    {MODES.map((m, i) => (
                      <DropdownMenuItem
                        className="items-start gap-2.5 py-2"
                        key={m.id}
                        onClick={() => {
                          c.setManual(null);
                          c.setMode(m.id);
                        }}
                      >
                        <ModeIcon className="mt-0.5" id={m.id} />
                        <span className="flex flex-1 flex-col gap-0.5">
                          <span className="flex items-center gap-1.5">
                            {m.title}
                            {!c.manual && c.mode === m.id && <Check className="size-3.5" />}
                          </span>
                          <span className="text-muted-foreground text-xs">{m.hint}</span>
                          <span className="text-muted-foreground/80 text-xs">{modelById(m.model).title}</span>
                        </span>
                        <DropdownMenuShortcut>⌘{i + 1}</DropdownMenuShortcut>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setPicking(true)}>
                    <SlidersHorizontal /> Своя модель…
                    <DropdownMenuShortcut>⌘/</DropdownMenuShortcut>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </span>
      </span>
    </>
  );

  return (
    <div className="relative">
      <ModesField {...p} bar={bar} c={c} onKeyDown={modeShortcut(c)} strip="when-used" />
      {/* The model list opens over the send button, where the choice was made */}
      <Popover onOpenChange={setPicking} open={picking}>
        <PopoverTrigger nativeButton={false} render={<span aria-hidden className="pointer-events-none absolute right-10 bottom-10 size-0" />} />
        <PopoverContent align="end" className="w-96 p-1" side="top">
          <ModelList
            current={c.model.id}
            onPick={(m) => {
              c.setManual(m.id);
              setPicking(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
};
