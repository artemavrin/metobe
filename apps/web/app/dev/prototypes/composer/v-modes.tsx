"use client";

// «Режимы» (D8): choose the intent, not the model. «Быстро / Обычно / Глубоко» — the admin maps each to a model
// and its thinking; the tooltip says which. «Точнее…» picks a model by hand, and the modes step aside until
// «вернуть режимы». Everything that shapes the answer is in view as a strip above the text: connections,
// the skill, files — each removable, each addable from the strip itself.
import { Button } from "@metobe/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@metobe/ui/components/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@metobe/ui/components/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@metobe/ui/components/popover";
import { cn } from "@metobe/ui/lib/utils";
import { FileText, Gauge, Paperclip, Plus, Sparkles, Zap } from "lucide-react";
import { useState } from "react";

import { BrandLogo } from "@/components/brand-logo";

import { NO_AUTOFILL } from "../_p7/shared";
import { CONNECTIONS, type Connection, EFFORTS, type Mode, MODES, modelById, SKILLS, type Skill } from "./data";
import { Segmented } from "./segmented";
import {
  Chip,
  type ComposerProps,
  ConnectionIcon,
  EASE,
  ModelList,
  SendButton,
  useFiles,
  useMentions,
  useModelHotkey,
} from "./shared";

const MODE_ICON = { deep: Sparkles, fast: Zap, normal: Gauge } as const;

export const ComposerModes = ({ onSend, onStop, streaming, autoFocus, home }: ComposerProps) => {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode["id"]>("normal");
  /** A model picked by hand overrides the mode until the user returns to modes. */
  const [manual, setManual] = useState<string | null>(null);
  const [skill, setSkill] = useState<Skill>();
  const [connections, setConnections] = useState<Connection[]>([CONNECTIONS[0] as Connection, CONNECTIONS[1] as Connection]);
  const [open, setOpen] = useState(false);
  const files = useFiles();
  const current = MODES.find((m) => m.id === mode) as Mode;
  const model = modelById(manual ?? current.model);
  useModelHotkey(() => setOpen(true));
  const mentions = useMentions({
    onConnection: (c) => setConnections((cs) => [...cs, c]),
    onSkill: setSkill,
    setText,
    taken: connections.map((c) => c.id),
    text,
  });

  const submit = () => {
    if (!text.trim() || streaming) {
      return;
    }
    onSend({ connections, effort: manual ? "normal" : current.effort, files: files.files, model, skill, text: text.trim() });
    setText("");
    setSkill(undefined);
    files.clear();
  };
  const free = CONNECTIONS.filter((c) => !connections.some((x) => x.id === c.id));

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
      <InputGroup className={cn("bg-background rounded-2xl shadow-xs", home && "shadow-sm")}>
        {/* What shapes the answer, always in view: the strip is where things are added and taken away */}
        <InputGroupAddon align="block-start" className="flex-wrap gap-1 border-b pb-2">
          {connections.map((c) => (
            <Chip icon={<ConnectionIcon id={c.id} />} key={c.id} label={c.title} onRemove={() => setConnections((cs) => cs.filter((x) => x.id !== c.id))} />
          ))}
          {skill && <Chip icon={<span className="text-muted-foreground">/</span>} label={skill.title} onRemove={() => setSkill(undefined)} />}
          {files.files.map((f) => (
            <Chip icon={<FileText />} key={f.id} label={f.name} onRemove={() => files.remove(f.id)} />
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button className="text-muted-foreground h-6 gap-1 px-1.5 text-xs" size="xs" type="button" variant="ghost" />}>
              <Plus className="size-3.5" /> Добавить
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60">
              {free.length > 0 && (
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Подключения</DropdownMenuLabel>
                  {free.map((c) => (
                    <DropdownMenuItem key={c.id} onClick={() => setConnections((cs) => [...cs, c])}>
                      <ConnectionIcon id={c.id} /> {c.title}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>Скилл</DropdownMenuLabel>
                {SKILLS.map((s) => (
                  <DropdownMenuItem key={s.id} onClick={() => setSkill(s)}>
                    <span className="text-muted-foreground w-4 text-center">/</span> {s.title}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={files.open}>
                <Paperclip /> Файл
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </InputGroupAddon>
        <InputGroupTextarea
          {...NO_AUTOFILL}
          aria-activedescendant={mentions.activeId}
          autoFocus={autoFocus}
          className={cn("max-h-60 text-base md:text-sm", home ? "min-h-20" : "min-h-12")}
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
            } else if (e.key === "Escape" && streaming) {
              onStop();
            }
          }}
          placeholder="Спросите что-нибудь…"
          value={text}
        />
        <InputGroupAddon align="block-end" className="flex-wrap justify-between gap-y-2">
          <span className="flex items-center gap-2">
            {manual ? (
              <span className={cn("animate-in fade-in flex items-center gap-1.5 text-xs duration-150", EASE)}>
                <BrandLogo label={model.makerTitle} logo={model.maker} size={16} tile={false} />
                {model.title}
                <button className="text-muted-foreground hover:text-foreground underline-offset-2 transition-colors hover:underline" onClick={() => setManual(null)} type="button">
                  вернуть режимы
                </button>
              </span>
            ) : (
              <Segmented
                label="Режим"
                onChange={setMode}
                options={MODES.map((m) => {
                  const Icon = MODE_ICON[m.id as keyof typeof MODE_ICON];
                  const target = modelById(m.model);
                  return {
                    id: m.id,
                    label: (
                      <>
                        <Icon /> {m.title}
                      </>
                    ),
                    tip: (
                      <span className="flex flex-col gap-0.5">
                        <span>{m.hint}</span>
                        <span className="opacity-70">
                          {target.title} · {EFFORTS.find((e) => e.id === m.effort)?.label.toLowerCase()}
                        </span>
                      </span>
                    ),
                  };
                })}
                value={mode}
              />
            )}
            <Popover onOpenChange={setOpen} open={open}>
              <PopoverTrigger render={<InputGroupButton className="text-muted-foreground" size="xs" variant="ghost" />}>Точнее…</PopoverTrigger>
              <PopoverContent align="start" className="w-96 p-1" side="top">
                <ModelList
                  current={model.id}
                  onPick={(m) => {
                    setManual(m.id);
                    setOpen(false);
                  }}
                />
              </PopoverContent>
            </Popover>
          </span>
          <span className="ml-auto">
            <SendButton disabled={!text.trim()} onStop={onStop} streaming={streaming} />
          </span>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
};
