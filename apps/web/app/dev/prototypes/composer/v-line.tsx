"use client";

// «Строка»: the least chrome that works. The text field and one model chip; skills come by `/`, connections by
// `@`, files by the paperclip or a drop. What was brought in shows as chips inside the field, and only then.
// The model list is a compact popover from the chip (⌘/ too) — a daily action, so it opens fast and plain.
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@metobe/ui/components/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@metobe/ui/components/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import { Brain, ChevronDown, FileText, Paperclip } from "lucide-react";
import { useState } from "react";

import { BrandLogo } from "@/components/brand-logo";

import { NO_AUTOFILL } from "../_p7/shared";
import { type Connection, DEFAULT_MODEL, modelById, type Skill } from "./data";
import {
  Chip,
  type ComposerProps,
  ConnectionIcon,
  Hint,
  Kbd,
  ModelList,
  SendButton,
  useFiles,
  useMentions,
  useModelHotkey,
} from "./shared";

export const ComposerLine = ({ onSend, onStop, streaming, autoFocus, home }: ComposerProps) => {
  const [text, setText] = useState("");
  const [modelId, setModelId] = useState(DEFAULT_MODEL);
  const [thinking, setThinking] = useState(true);
  const [skill, setSkill] = useState<Skill>();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [open, setOpen] = useState(false);
  const files = useFiles();
  const model = modelById(modelId);
  const canThink = model.caps.reasoning !== false;
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
    onSend({ connections, effort: canThink && thinking ? "normal" : "off", files: files.files, model, skill, text: text.trim() });
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
      <InputGroup className={cn("bg-background rounded-2xl shadow-xs", home && "shadow-sm")}>
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
          aria-controls={mentions.open ? "mention-menu" : undefined}
          aria-expanded={mentions.open}
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
          onSelect={(e) => mentions.onCaret(e.currentTarget)}
          placeholder="Спросите что-нибудь…"
          value={text}
        />
        <InputGroupAddon align="block-end" className="justify-between">
          <span className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger render={<InputGroupButton aria-label="Прикрепить файл" onClick={files.open} size="icon-xs" variant="ghost" />}>
                <Paperclip />
              </TooltipTrigger>
              <TooltipContent>Прикрепить файл</TooltipContent>
            </Tooltip>
            <Popover onOpenChange={setOpen} open={open}>
              <PopoverTrigger render={<InputGroupButton className="gap-1.5" size="xs" variant="ghost" />}>
                <BrandLogo label={model.makerTitle} logo={model.maker} size={16} tile={false} />
                {model.title}
                <ChevronDown className="opacity-50" />
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 p-1" side="top">
                <ModelList
                  current={modelId}
                  dense
                  onPick={(m) => {
                    setModelId(m.id);
                    setOpen(false);
                  }}
                />
              </PopoverContent>
            </Popover>
            {canThink && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <InputGroupButton
                      aria-label="Размышления"
                      aria-pressed={thinking}
                      className={cn("transition-colors duration-150", thinking ? "text-foreground" : "text-muted-foreground/60")}
                      onClick={() => setThinking((t) => !t)}
                      size="icon-xs"
                      variant="ghost"
                    />
                  }
                >
                  <Brain />
                </TooltipTrigger>
                <TooltipContent>{thinking ? "Размышляет, когда нужно — нажмите, чтобы отвечал сразу" : "Отвечает сразу — нажмите, чтобы размышлял"}</TooltipContent>
              </Tooltip>
            )}
          </span>
          <span className="flex items-center gap-3">
            <Hint>
              <Kbd>/</Kbd> скиллы <Kbd>@</Kbd> подключения
            </Hint>
            <SendButton disabled={!text.trim()} onStop={onStop} streaming={streaming} />
          </span>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
};
