"use client";

// Round 3, after T3 Chat / T3 Code: a clean composer with a model chip and a separate thinking button; the picker
// is where the work is. Shared here: favorites (the user's own pins — nothing is recommended), capability badges
// in colour, the thinking button, and the composer frame each picker plugs into.
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@metobe/ui/components/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@metobe/ui/components/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@metobe/ui/components/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import { Brain, ChevronDown, Eye, FileText, Paperclip, Wrench } from "lucide-react";
import { useState } from "react";

import { BrandLogo } from "@/components/brand-logo";

import { NO_AUTOFILL } from "../_p7/shared";
import { type ChatModel, type Connection, DEFAULT_MODEL, type Effort, EFFORTS, modelById, type Skill } from "./data";
import { Chip, type ComposerProps, ConnectionIcon, Hint, Kbd, SendButton, useFiles, useMentions, useModelHotkey } from "./shared";

// --- favorites ------------------------------------------------------------------------------------

/** The user's pins, in their order. Starts with what they pinned before (illustrative). */
export const useFavorites = () => {
  const [ids, setIds] = useState<string[]>(["claude-sonnet-4.6", "gpt-5.2-mini", "aliceai-llm", "gemini-3-pro"]);
  return {
    ids,
    has: (id: string) => ids.includes(id),
    toggle: (id: string) => setIds((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id])),
    /** A new order; the numbers ⌘1–9 follow it. */
    reorder: (next: string[]) => setIds(next),
    /** Takes several out at once (a picker's soft un-stars, applied on close). */
    removeMany: (drop: string[]) => setIds((xs) => xs.filter((x) => !drop.includes(x))),
  };
};
export type Favorites = ReturnType<typeof useFavorites>;

// --- capabilities in colour -----------------------------------------------------------------------

const CAP = [
  { cls: "text-sky-600 bg-sky-500/10 dark:text-sky-400", icon: Eye, key: "vision", label: "Картинки" },
  { cls: "text-amber-600 bg-amber-500/10 dark:text-amber-400", icon: Wrench, key: "tools", label: "Инструменты" },
  { cls: "text-violet-600 bg-violet-500/10 dark:text-violet-400", icon: Brain, key: "reasoning", label: "Размышления" },
] as const;

/** Only what the model can (or might): a filled chip — yes, a dashed one — the source did not say; «no» is absent. */
export const CapBadges = ({ m, size = "sm" }: { m: ChatModel; size?: "sm" | "xs" }) => (
  <span className="flex items-center gap-1">
    {CAP.map(({ cls, icon: Icon, key, label }) => {
      const v = m.caps[key];
      if (v === false) {
        return null;
      }
      return (
        <Tooltip key={key}>
          <TooltipTrigger
            render={
              <span
                className={cn(
                  "flex items-center justify-center rounded-md",
                  size === "sm" ? "size-6" : "size-5",
                  v === true ? cls : "text-muted-foreground border border-dashed"
                )}
              />
            }
          >
            <Icon className={size === "sm" ? "size-3.5" : "size-3"} />
          </TooltipTrigger>
          <TooltipContent>
            {label}
            {v === null && " — не проверено, попробуем"}
          </TooltipContent>
        </Tooltip>
      );
    })}
  </span>
);

export const CAP_FILTERS = CAP;

// --- thinking, next to the model like T3 ---------------------------------------------------------

export const EffortButton = ({ model, value, onChange }: { model: ChatModel; value: Effort; onChange: (e: Effort) => void }) => {
  if (model.caps.reasoning === false) {
    return null;
  }
  const label = EFFORTS.find((e) => e.id === value)?.label ?? "";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<InputGroupButton className={cn("gap-1.5", value === "off" && "text-muted-foreground")} size="xs" variant="ghost" />}>
        <Brain /> {value === "off" ? "Без размышлений" : label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64" side="top">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Размышления</DropdownMenuLabel>
          <DropdownMenuRadioGroup onValueChange={(v) => onChange(v as Effort)} value={value}>
            {EFFORTS.map((e) => (
              <DropdownMenuRadioItem className="items-start" key={e.id} value={e.id}>
                <span className="flex flex-col">
                  {e.label}
                  <span className="text-muted-foreground text-xs">{e.hint}</span>
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

// --- the composer frame ---------------------------------------------------------------------------

export type PickerProps = {
  current: ChatModel;
  onPick: (m: ChatModel) => void;
  favorites: Favorites;
};

/**
 * A clean field: text, then the model chip and the thinking button on the left, send on the right. `/` and `@`
 * work as before. The picker opens from the chip (⌘/ too); `wide` pickers get a wider popover.
 */
export const T3Composer = ({
  Picker,
  popoverClass = "w-[26rem]",
  ...p
}: ComposerProps & { Picker: (props: PickerProps & { close: () => void }) => React.ReactNode; popoverClass?: string }) => {
  const [text, setText] = useState("");
  const [modelId, setModelId] = useState(DEFAULT_MODEL);
  const [effort, setEffort] = useState<Effort>("normal");
  const [skill, setSkill] = useState<Skill>();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [open, setOpen] = useState(false);
  /** Every opening starts fresh: the favorites list, an empty search. */
  const [opened, setOpened] = useState(0);
  const favorites = useFavorites();
  const files = useFiles();
  const model = modelById(modelId);
  const openPicker = (o: boolean) => {
    if (o && !open) {
      setOpened((n) => n + 1);
    }
    setOpen(o);
  };
  useModelHotkey(() => openPicker(true));
  const mentions = useMentions({
    onConnection: (c) => setConnections((cs) => [...cs, c]),
    onSkill: setSkill,
    setText,
    taken: connections.map((c) => c.id),
    text,
  });
  const submit = () => {
    if (!text.trim() || p.streaming) {
      return;
    }
    p.onSend({ connections, effort: model.caps.reasoning === false ? "off" : effort, files: files.files, model, skill, text: text.trim() });
    setText("");
    setSkill(undefined);
    setConnections([]);
    files.clear();
  };
  const brought = Boolean(skill) || connections.length > 0 || files.files.length > 0;

  return (
    <form
      className="relative"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {mentions.menu}
      {files.picker}
      <InputGroup className={cn("bg-background rounded-2xl shadow-xs", p.home && "shadow-sm")}>
        {brought && (
          <InputGroupAddon align="block-start" className="flex-wrap gap-1 pb-0">
            {skill && <Chip icon={<span className="text-muted-foreground">/</span>} label={skill.title} onRemove={() => setSkill(undefined)} />}
            {connections.map((c) => (
              <Chip icon={<ConnectionIcon id={c.id} />} key={c.id} label={c.title} onRemove={() => setConnections((cs) => cs.filter((x) => x.id !== c.id))} />
            ))}
            {files.files.map((f) => (
              <Chip icon={<FileText />} key={f.id} label={f.name} onRemove={() => files.remove(f.id)} />
            ))}
          </InputGroupAddon>
        )}
        <InputGroupTextarea
          {...NO_AUTOFILL}
          aria-activedescendant={mentions.activeId}
          autoFocus={p.autoFocus}
          className={cn("max-h-60 text-base md:text-sm", p.home ? "min-h-20" : "min-h-12")}
          onChange={(e) => {
            setText(e.target.value);
            mentions.onCaret(e.target);
          }}
          onKeyDown={(e) => {
            if (mentions.onKeyDown(e)) {
              return;
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape" && p.streaming) {
              p.onStop();
            }
          }}
          placeholder="Спросите что-нибудь…"
          value={text}
        />
        <InputGroupAddon align="block-end" className="justify-between">
          <span className="flex items-center gap-0.5">
            <Popover onOpenChange={openPicker} open={open}>
              <PopoverTrigger render={<InputGroupButton className="gap-1.5" size="xs" variant="ghost" />}>
                <BrandLogo label={model.makerTitle} logo={model.maker} size={16} tile={false} />
                {model.title}
                <ChevronDown className="opacity-50" />
              </PopoverTrigger>
              <PopoverContent align="start" className={cn("overflow-hidden p-0", popoverClass)} side="top" sideOffset={8}>
                <Picker
                  close={() => setOpen(false)}
                  key={opened}
                  current={model}
                  favorites={favorites}
                  onPick={(m) => {
                    setModelId(m.id);
                    setOpen(false);
                  }}
                />
              </PopoverContent>
            </Popover>
            <EffortButton model={model} onChange={setEffort} value={effort} />
            <Tooltip>
              <TooltipTrigger render={<InputGroupButton aria-label="Прикрепить файл" onClick={files.open} size="icon-xs" variant="ghost" />}>
                <Paperclip />
              </TooltipTrigger>
              <TooltipContent>Прикрепить файл</TooltipContent>
            </Tooltip>
          </span>
          <span className="flex items-center gap-3">
            <Hint>
              <Kbd>/</Kbd> скиллы <Kbd>@</Kbd> подключения
            </Hint>
            <SendButton disabled={!text.trim()} onStop={p.onStop} streaming={p.streaming} />
          </span>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
};
