"use client";

// «Палитра»: keyboard first, facts in view. The bar under the field says which model and through which source,
// how hard it thinks (a visible three-way control), and how many connections are on. ⌘/ opens a palette: the
// list on the left, the highlighted model's card on the right — context, prices, capabilities — to compare
// without opening anything. Opened by a hotkey many times a day, so it appears at once, without motion.
import { Badge } from "@metobe/ui/components/reui/badge";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@metobe/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@metobe/ui/components/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@metobe/ui/components/input-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import { Brain, FileText, Paperclip, Plug } from "lucide-react";
import { useState } from "react";

import { BrandLogo } from "@/components/brand-logo";

import { NO_AUTOFILL } from "../_p7/shared";
import {
  type ChatModel,
  CONNECTIONS,
  type Connection,
  DEFAULT_MODEL,
  type Effort,
  EFFORTS,
  fmtContext,
  modelById,
  RECENT,
  type Skill,
} from "./data";
import { Segmented } from "./segmented";
import {
  Caps,
  Chip,
  type ComposerProps,
  ConnectionIcon,
  hotkeyLabel,
  Kbd,
  ModelList,
  SendButton,
  useFiles,
  useMentions,
  useModelHotkey,
} from "./shared";

const money = (m: ChatModel, v: number | undefined) => (v === undefined ? "—" : `${m.price?.currency === "USD" ? "$" : "₽"}${v}`);

/** The highlighted model in full: what the admin's API knows, nothing more. */
const ModelCard = ({ m }: { m: ChatModel }) => {
  const rows: [string, React.ReactNode][] = [
    ["Контекст", m.context ? `${fmtContext(m.context)} токенов` : "не сообщается"],
    ["Цена за 1M", m.price ? `${money(m, m.price.input)} вход · ${money(m, m.price.output)} выход` : "не задана"],
    ["Из кэша", m.price?.cacheRead === undefined ? "—" : `${money(m, m.price.cacheRead)} за 1M`],
    ["Источник", m.source],
    ["Выпущена", m.released ? new Date(m.released).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }) : "—"],
  ];
  return (
    <div className="flex flex-col gap-4 p-4" key={m.id}>
      <div className="flex items-start gap-3">
        <BrandLogo label={m.makerTitle} logo={m.maker} size={36} />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-medium">{m.title}</span>
          <span className="text-muted-foreground text-xs">{m.makerTitle}</span>
          <span className="flex flex-wrap gap-1">
            {m.id === DEFAULT_MODEL && (
              <Badge size="sm" variant="primary-light">
                по умолчанию
              </Badge>
            )}
            {RECENT.includes(m.id) && (
              <Badge size="sm" variant="secondary">
                недавно
              </Badge>
            )}
          </span>
        </div>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
        {rows.map(([k, v]) => (
          <div className="contents" key={k}>
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="tabular-nums">{v}</dd>
          </div>
        ))}
        <dt className="text-muted-foreground">Умеет</dt>
        <dd>
          <Caps m={m} />
        </dd>
      </dl>
    </div>
  );
};

export const ComposerPalette = ({ onSend, onStop, streaming, autoFocus, home }: ComposerProps) => {
  const [text, setText] = useState("");
  const [modelId, setModelId] = useState(DEFAULT_MODEL);
  const [effort, setEffort] = useState<Effort>("normal");
  const [skill, setSkill] = useState<Skill>();
  const [connections, setConnections] = useState<Connection[]>([CONNECTIONS[0] as Connection]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<ChatModel>(modelById(DEFAULT_MODEL));
  const files = useFiles();
  const model = modelById(modelId);
  const canThink = model.caps.reasoning !== false;
  useModelHotkey(() => {
    setHighlight(modelById(modelId));
    setOpen(true);
  });
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
    onSend({ connections, effort: canThink ? effort : "off", files: files.files, model, skill, text: text.trim() });
    setText("");
    setSkill(undefined);
    files.clear();
  };

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
        {(skill || files.files.length > 0) && (
          <InputGroupAddon align="block-start" className="flex-wrap gap-1 pb-0">
            {skill && <Chip icon={<span className="text-muted-foreground">/</span>} label={skill.title} onRemove={() => setSkill(undefined)} />}
            {files.files.map((f) => (
              <Chip icon={<FileText />} key={f.id} label={f.name} onRemove={() => files.remove(f.id)} />
            ))}
          </InputGroupAddon>
        )}
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
          placeholder="Спросите что-нибудь…  / скилл, @ подключение"
          value={text}
        />
        <InputGroupAddon align="block-end" className="flex-wrap justify-between gap-y-2">
          <span className="flex flex-wrap items-center gap-1.5">
            <InputGroupButton
              className="h-7 gap-1.5 pr-1.5"
              onClick={() => {
                setHighlight(model);
                setOpen(true);
              }}
              size="xs"
              variant="outline"
            >
              <BrandLogo label={model.makerTitle} logo={model.maker} size={16} tile={false} />
              <span>{model.title}</span>
              <span className="text-muted-foreground hidden sm:inline">· {model.source}</span>
              <Kbd className="ml-0.5">{hotkeyLabel}</Kbd>
            </InputGroupButton>
            <Segmented
              label="Размышления"
              onChange={setEffort}
              options={EFFORTS.map((e) => ({
                disabled: !canThink && e.id !== "off",
                id: e.id,
                label: e.id === "off" ? "Сразу" : e.id === "normal" ? (<><Brain /> Обычно</>) : "Глубоко",
                tip: canThink ? e.hint : `${model.title} не умеет размышлять`,
              }))}
              value={canThink ? effort : "off"}
            />
          </span>
          <span className="ml-auto flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger render={<InputGroupButton className="gap-1.5" size="xs" variant="ghost" />}>
                <Plug /> {connections.length || ""}
                <span className="sr-only">Подключения</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56" side="top">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Что модель может спросить</DropdownMenuLabel>
                  {CONNECTIONS.map((c) => (
                    <DropdownMenuCheckboxItem
                      checked={connections.some((x) => x.id === c.id)}
                      key={c.id}
                      onCheckedChange={(on) => setConnections((cs) => (on ? [...cs, c] : cs.filter((x) => x.id !== c.id)))}
                    >
                      <ConnectionIcon id={c.id} /> {c.title}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Tooltip>
              <TooltipTrigger render={<InputGroupButton aria-label="Прикрепить файл" onClick={files.open} size="icon-xs" variant="ghost" />}>
                <Paperclip />
              </TooltipTrigger>
              <TooltipContent>Прикрепить файл</TooltipContent>
            </Tooltip>
            <SendButton disabled={!text.trim()} onStop={onStop} streaming={streaming} />
          </span>
        </InputGroupAddon>
      </InputGroup>

      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent
          className="top-[18%] translate-y-0 gap-0 overflow-hidden p-0 duration-0 data-closed:animate-none data-open:animate-none sm:max-w-3xl"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">Выбор модели</DialogTitle>
          <DialogDescription className="sr-only">Список моделей в чате и сведения о выделенной</DialogDescription>
          <div className="grid md:grid-cols-[1fr_280px]">
            <ModelList
              className="border-b md:border-r md:border-b-0"
              current={modelId}
              onHighlight={setHighlight}
              onPick={(m) => {
                setModelId(m.id);
                setOpen(false);
              }}
            />
            <div className="bg-muted/30 hidden md:block">
              <ModelCard m={highlight} />
            </div>
          </div>
          <div className="text-muted-foreground flex items-center gap-3 border-t px-3 py-2 text-[11px]">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> выбрать
            </span>
            <span className="flex items-center gap-1">
              <Kbd>↵</Kbd> взять
            </span>
            <span className="flex items-center gap-1">
              <Kbd>Esc</Kbd> закрыть
            </span>
            <span className="ml-auto">Модели включает администратор в настройках</span>
          </div>
        </DialogContent>
      </Dialog>
    </form>
  );
};
