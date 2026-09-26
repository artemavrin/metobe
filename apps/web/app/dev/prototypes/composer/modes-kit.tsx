"use client";

// Round 2 around «Режимы»: what every riff shares — the state (mode, a model picked by hand, what is brought in),
// the chip strip, and the field itself. Riffs differ only in where the mode lives and how it is chosen.
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
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@metobe/ui/components/input-group";
import { cn } from "@metobe/ui/lib/utils";
import { FileText, Gauge, Paperclip, Plus, Sparkles, Zap } from "lucide-react";
import { useState } from "react";

import { NO_AUTOFILL } from "../_p7/shared";
import { CONNECTIONS, type Connection, type Mode, MODES, modelById, SKILLS, type Skill } from "./data";
import { Chip, type ComposerProps, ConnectionIcon, useFiles, useMentions, useModelHotkey } from "./shared";

export const MODE_ICON = { deep: Sparkles, fast: Zap, normal: Gauge } as const;
export const ModeIcon = ({ id, className }: { id: string; className?: string }) => {
  const Icon = MODE_ICON[id as keyof typeof MODE_ICON] ?? Gauge;
  return <Icon className={className} />;
};

export type ModeId = Mode["id"];

export const useModesComposer = ({
  onSend,
  streaming,
  initialConnections = [CONNECTIONS[0] as Connection],
  onHotkey,
  resolveMode,
}: Pick<ComposerProps, "onSend" | "streaming"> & {
  initialConnections?: Connection[];
  onHotkey?: () => void;
  /** «Авто»: the mode to use for this text when the user did not pick one. */
  resolveMode?: (text: string, files: number) => ModeId;
}) => {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<ModeId>("normal");
  const [manual, setManual] = useState<string | null>(null);
  const [skill, setSkill] = useState<Skill>();
  const [connections, setConnections] = useState<Connection[]>(initialConnections);
  const files = useFiles();
  const effective = resolveMode ? resolveMode(text, files.files.length) : mode;
  const current = MODES.find((m) => m.id === effective) as Mode;
  const model = modelById(manual ?? current.model);
  useModelHotkey(() => onHotkey?.());
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
    onSend({
      connections,
      effort: manual ? "normal" : current.effort,
      files: files.files,
      mode: manual ? "Своя модель" : current.title,
      model,
      skill,
      text: text.trim(),
    });
    setText("");
    setSkill(undefined);
    files.clear();
  };

  return { connections, current, files, manual, mentions, mode, model, setConnections, setManual, setMode, setSkill, setText, skill, submit, text };
};
export type ModesComposer = ReturnType<typeof useModesComposer>;

/** «+»: a connection, a skill or a file. */
export const AddMenu = ({ c, label, className }: { c: ModesComposer; label?: string; className?: string }) => {
  const free = CONNECTIONS.filter((x) => !c.connections.some((y) => y.id === x.id));
  return (
      <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button aria-label="Добавить подключение, скилл или файл" className={cn("text-muted-foreground h-6 gap-1 px-1.5 text-xs", className)} size="xs" type="button" variant="ghost" />}
      >
        <Plus className="size-3.5" /> {label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {free.length > 0 && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Подключения</DropdownMenuLabel>
              {free.map((x) => (
                <DropdownMenuItem key={x.id} onClick={() => c.setConnections((cs) => [...cs, x])}>
                  <ConnectionIcon id={x.id} /> {x.title}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Скилл</DropdownMenuLabel>
          {SKILLS.map((s) => (
            <DropdownMenuItem key={s.id} onClick={() => c.setSkill(s)}>
              <span className="text-muted-foreground w-4 text-center">/</span> {s.title}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={c.files.open}>
          <Paperclip /> Файл
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/** What shapes the answer, as chips; «Добавить» brings in a connection, a skill or a file. */
export const ChipStrip = ({ c, compact }: { c: ModesComposer; compact?: boolean }) => {
  return (
    <>
      {c.connections.map((x) => (
        <Chip icon={<ConnectionIcon id={x.id} />} key={x.id} label={x.title} onRemove={() => c.setConnections((cs) => cs.filter((y) => y.id !== x.id))} />
      ))}
      {c.skill && <Chip icon={<span className="text-muted-foreground">/</span>} label={c.skill.title} onRemove={() => c.setSkill(undefined)} />}
      {c.files.files.map((f) => (
        <Chip icon={<FileText />} key={f.id} label={f.name} onRemove={() => c.files.remove(f.id)} />
      ))}
      <AddMenu c={c} label={compact ? undefined : "Добавить"} />
    </>
  );
};

/** The field: the strip on top (or none), the text, the bottom bar. Enter sends, Esc stops, `/` and `@` work. */
export const ModesField = ({
  c,
  strip = "always",
  bar,
  onStop,
  streaming,
  autoFocus,
  home,
  onKeyDown,
}: {
  c: ModesComposer;
  strip?: "always" | "when-used" | "none";
  bar: React.ReactNode;
  onKeyDown?: (e: React.KeyboardEvent) => boolean;
} & Pick<ComposerProps, "onStop" | "streaming" | "autoFocus" | "home">) => {
  const used = c.connections.length > 0 || Boolean(c.skill) || c.files.files.length > 0;
  return (
    <form
      className="relative"
      onSubmit={(e) => {
        e.preventDefault();
        c.submit();
      }}
    >
      {c.mentions.menu}
      {c.files.picker}
      <InputGroup className={cn("bg-background rounded-2xl shadow-xs", home && "shadow-sm")}>
        {(strip === "always" || (strip === "when-used" && used)) && (
          <InputGroupAddon align="block-start" className={cn("flex-wrap gap-1", strip === "always" && "border-b pb-2", strip === "when-used" && "pb-0")}>
            <ChipStrip c={c} compact={strip === "when-used"} />
          </InputGroupAddon>
        )}
        <InputGroupTextarea
          {...NO_AUTOFILL}
          aria-activedescendant={c.mentions.activeId}
          autoFocus={autoFocus}
          className={cn("max-h-60 text-base md:text-sm", home ? "min-h-20" : "min-h-12")}
          onChange={(e) => {
            c.setText(e.target.value);
            c.mentions.onCaret(e.target);
          }}
          onKeyDown={(e) => {
            if (c.mentions.onKeyDown(e) || onKeyDown?.(e)) {
              return;
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              c.submit();
            } else if (e.key === "Escape" && streaming) {
              onStop();
            }
          }}
          placeholder="Спросите что-нибудь…"
          value={c.text}
        />
        <InputGroupAddon align="block-end" className="flex-wrap justify-between gap-y-2">
          {bar}
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
};

/** ⌘1 / ⌘2 / ⌘3 switch modes while typing — a keyboard action, so the switch itself is instant. */
export const modeShortcut = (c: ModesComposer) => (e: React.KeyboardEvent) => {
  const i = ["1", "2", "3"].indexOf(e.key);
  if ((e.metaKey || e.ctrlKey) && i >= 0) {
    e.preventDefault();
    c.setManual(null);
    c.setMode((MODES[i] as Mode).id);
    return true;
  }
  return false;
};
