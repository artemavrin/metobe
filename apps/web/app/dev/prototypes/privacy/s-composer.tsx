"use client";

import { Button } from "@metobe/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@metobe/ui/components/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@metobe/ui/components/popover";
import { Alert, AlertDescription, AlertTitle } from "@metobe/ui/components/reui/alert";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@metobe/ui/components/sheet";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowUp, ChevronDown, FileSpreadsheet, Plus, Server, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { useProto } from "../memory/frame";
import { ATTACHMENT, CLOUD, DRAFT, LOCAL, hiddenSummary, mask, uniqueHidden } from "./data";
import type { Piece } from "./data";
import { ChatShell, UserBubble, usePhone } from "./frame";
import { ModelView } from "./model-view";
import { EASE, ENTER, PRESS } from "./parts";

// Сцена «Поле ввода» (З7). Пока человек печатает, у поля чип «Скрыто: 2 имени, телефон» (запрос к шлюзу через 350 мс
// после ввода, без записи). По нажатию — предпросмотр того же вида, что панель ответа. Спорное — место чипа и вмещалище:
//   1 «Над полем» — чип над левым краем поля, предпросмотр — всплывающее окно над полем;
//   2 «Внутри поля» — чип в строке кнопок у выбора модели, предпросмотр раскрывается в самом поле, над текстом.
// На телефоне предпросмотр — шторка снизу в обоих. Ручки: `model=cloud|local`, `att=no|yes`, `svc=ok|down`, `open=1`.

/** Черновик печатается сам, дальше поле обычное; маска — через паузу после ввода, как запрос к шлюзу. */
const useDraft = () => {
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(true);
  const [pieces, setPieces] = useState<Piece[]>([]);
  useEffect(() => {
    if (!typing) return;
    if (text.length >= DRAFT.length) {
      setTyping(false);
      return;
    }
    const t = setTimeout(() => setText(DRAFT.slice(0, text.length + 2)), 16);
    return () => clearTimeout(t);
  }, [text, typing]);
  useEffect(() => {
    const t = setTimeout(() => setPieces(mask(text).pieces), 350);
    return () => clearTimeout(t);
  }, [text]);
  return {
    onChange: (v: string) => {
      setTyping(false);
      setText(v);
    },
    pieces,
    text,
    typing,
  };
};

export const useComposerScene = () => {
  const { knobs, setKnob } = useProto();
  const draft = useDraft();
  const local = knobs.model === "local";
  const down = knobs.svc === "down" && !local;
  const att = knobs.att === "yes";
  const hidden = uniqueHidden(draft.pieces);
  const model = local ? LOCAL : CLOUD;
  return { att, down, draft, hidden, local, model, setModel: (v: string) => setKnob("model", v), wantOpen: knobs.open === "1" };
};
export type Scene = ReturnType<typeof useComposerScene>;

/** Чип: что скрыто, «Не покидает сервер» или «Защита данных недоступна». Нет скрытого — нет чипа. */
/** `compact` — строка кнопок телефона: рядом модель и отправка, влезает только число. */
export const chipOf = (s: Scene, compact = false) => {
  if (s.local) return { icon: Server, text: compact ? "Локально" : "Не покидает сервер", tone: "" };
  if (s.down) return { icon: ShieldAlert, text: compact ? "Недоступна" : "Защита данных недоступна", tone: "text-destructive" };
  if (s.hidden.length === 0) return null;
  return { icon: ShieldCheck, text: compact ? `Скрыто ${s.hidden.length}` : `Скрыто: ${hiddenSummary(s.hidden)}`, tone: "" };
};

const PrivacyChip = ({
  scene,
  open,
  compact,
  className,
  ...rest
}: { scene: Scene; open: boolean; compact?: boolean; className?: string } & React.ComponentProps<"button">) => {
  const chip = chipOf(scene, compact);
  if (!chip) return null;
  const Icon = chip.icon;
  return (
    <Button
      aria-expanded={open}
      className={cn(
        "bg-background/80 dark:bg-muted/60 border-border h-7 max-w-full gap-1.5 rounded-full border px-2.5 text-xs font-normal",
        PRESS,
        ENTER,
        open && "bg-muted",
        chip.tone,
        className
      )}
      size="sm"
      type="button"
      variant="ghost"
      {...rest}
    >
      <Icon className={cn("size-3.5 shrink-0", chip.tone, !scene.local && !scene.down && "text-emerald-600 dark:text-emerald-400")} />
      {/* Счёт меняется на ходу: новый текст входит коротким фейдом. */}
      <span className={cn("animate-in fade-in truncate duration-150", EASE, chip.tone)} key={chip.text}>
        {chip.text}
      </span>
    </Button>
  );
};

/** То, что открывается по чипу. */
const Preview = ({ scene }: { scene: Scene }) =>
  scene.down ? (
    <Alert variant="destructive">
      <ShieldAlert />
      <AlertTitle>Не отправлено: защита данных недоступна</AlertTitle>
      <AlertDescription>Служба маскирования не отвечает. Во внешнюю модель запросы не уходят; локальные модели работают.</AlertDescription>
    </Alert>
  ) : (
    <ModelView attachment={scene.att ? ATTACHMENT : undefined} future model={scene.model} question={scene.draft.pieces} />
  );

export const ModelMenu = ({ scene }: { scene: Scene }) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      render={<Button className="text-muted-foreground h-9 gap-1 rounded-full px-2.5 text-sm font-normal" size="sm" type="button" variant="ghost" />}
    >
      <span className="max-w-32 truncate">{scene.model.name}</span>
      <ChevronDown className="size-3.5" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-56">
      <DropdownMenuRadioGroup onValueChange={(v) => scene.setModel(String(v))} value={scene.local ? "local" : "cloud"}>
        <DropdownMenuRadioItem value="cloud">{CLOUD.name}</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="local">{LOCAL.name} · локальная</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
);

/** Поле как в чате: одна «таблетка», полка вложений, текст, плюс, модель, отправка. */
const Pill = ({ scene, top, beforeModel }: { scene: Scene; top?: ReactNode; beforeModel?: ReactNode }) => {
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [scene.draft.text]);
  return (
    <div className="bg-muted/70 dark:bg-muted/40 border-border/70 focus-within:border-foreground/15 relative rounded-[24px] border p-1.5 [transition:border-color_200ms_ease]">
      {top}
      {scene.att && (
        <div className="px-1.5 pt-1 pb-1.5">
          <span className="bg-background/70 flex w-fit items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs">
            <FileSpreadsheet className="size-3.5 text-emerald-600" />
            {ATTACHMENT}
          </span>
        </div>
      )}
      <textarea
        aria-label="Сообщение"
        className="placeholder:text-muted-foreground block max-h-48 min-h-9 w-full resize-none bg-transparent px-2.5 py-1.5 text-sm leading-6 outline-none"
        onChange={(e) => scene.draft.onChange(e.target.value)}
        placeholder="Спросите что-нибудь"
        ref={field}
        rows={1}
        value={scene.draft.text}
      />
      <div className="flex items-center gap-1">
        <Button aria-label="Добавить" className="size-9 rounded-full" size="icon" type="button" variant="ghost">
          <Plus />
        </Button>
        <div className="flex min-w-0 flex-1 justify-end">{beforeModel}</div>
        <ModelMenu scene={scene} />
        <Button aria-disabled={scene.down} aria-label="Отправить" className={cn("size-9 rounded-full", PRESS, scene.down && "opacity-40")} size="icon" type="button">
          <ArrowUp />
        </Button>
      </div>
    </div>
  );
};

export const Hint = () => <p className="text-muted-foreground mt-2 text-center text-xs">Ответы модели могут содержать ошибки</p>;

/** Лента над полем: прошлый обмен, чтобы поле стояло в своём месте. */
export const Earlier = () => (
  <>
    <UserBubble>Собери продажи за октябрь по регионам.</UserBubble>
    <p className="text-sm leading-7">Готово: продажи за октябрь — 12,4 млн ₽, на 8 % больше сентября. Больше всего выросли Север и Урал.</p>
  </>
);

/** Телефон: предпросмотр — шторка снизу по кривой iOS-шторок. */
const PhoneSheet = ({ scene, open, onOpenChange }: { scene: Scene; open: boolean; onOpenChange: (o: boolean) => void }) => (
  <Sheet onOpenChange={onOpenChange} open={open}>
    <SheetContent
      className="@container max-h-[88dvh] gap-0 rounded-t-2xl duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] data-[side=bottom]:data-ending-style:translate-y-full data-[side=bottom]:data-starting-style:translate-y-full data-ending-style:opacity-100 data-starting-style:opacity-100"
      side="bottom"
    >
      <span aria-hidden="true" className="bg-foreground/15 mx-auto mt-2 h-1 w-9 shrink-0 rounded-full" />
      <SheetHeader className="pb-2">
        <SheetTitle>Что получит модель</SheetTitle>
      </SheetHeader>
      <div className="min-h-0 overflow-y-auto px-4 pb-6">
        <Preview scene={scene} />
      </div>
    </SheetContent>
  </Sheet>
);

/** Открыть по `open=1`, когда черновик допечатан и маска пришла. */
const useOpen = (scene: Scene) => {
  const [open, setOpen] = useState(false);
  const ready = !scene.draft.typing && scene.hidden.length > 0;
  const [asked, setAsked] = useState(false);
  if (scene.wantOpen && ready && !asked) {
    setAsked(true);
    setOpen(true);
  }
  return [open, setOpen] as const;
};

/** 1 · «Над полем»: чип над левым краем, предпросмотр всплывает над полем, по его ширине. */
export const ComposerPopover = () => {
  const scene = useComposerScene();
  const phone = usePhone();
  const [open, setOpen] = useOpen(scene);
  const chip = <PrivacyChip onClick={() => setOpen(!open)} open={open} scene={scene} />;
  return (
    <ChatShell
      composer={
        <div>
          <div className="flex h-9 items-center px-1.5">
            {phone ? (
              chip
            ) : (
              <Popover onOpenChange={setOpen} open={open}>
                <PopoverTrigger render={<PrivacyChip open={open} scene={scene} />} />
                <PopoverContent
                  align="start"
                  className="@container bg-popover max-h-[70dvh] w-[min(704px,calc(100vw-20rem))] gap-0 overflow-y-auto rounded-2xl p-4 duration-150"
                  side="top"
                  sideOffset={8}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-medium">Что получит модель</span>
                    <Button aria-label="Закрыть" onClick={() => setOpen(false)} size="icon-xs" variant="ghost">
                      <X />
                    </Button>
                  </div>
                  <Preview scene={scene} />
                </PopoverContent>
              </Popover>
            )}
          </div>
          <Pill scene={scene} />
          <Hint />
          {phone && <PhoneSheet onOpenChange={setOpen} open={open} scene={scene} />}
        </div>
      }
    >
      <Earlier />
    </ChatShell>
  );
};

/** 2 · «Внутри поля»: чип у выбора модели, предпросмотр раскрывается в самом поле над текстом. */
export const ComposerPanel = () => {
  const scene = useComposerScene();
  const phone = usePhone();
  const [open, setOpen] = useOpen(scene);
  const chip = <PrivacyChip className="min-w-0" compact={phone} onClick={() => setOpen(!open)} open={open} scene={scene} />;
  return (
    <ChatShell
      composer={
        <div>
          <Pill
            beforeModel={chip}
            scene={scene}
            top={
              !phone && (
                <div
                  className={cn(
                    "grid transition-[grid-template-rows,opacity] motion-reduce:[transition-property:opacity]",
                    EASE,
                    open ? "grid-rows-[1fr] opacity-100 duration-250" : "grid-rows-[0fr] opacity-0 duration-150"
                  )}
                  inert={!open}
                >
                  <div className="@container min-h-0 overflow-hidden">
                    <div className="bg-background dark:bg-background/60 m-0.5 mb-1.5 max-h-[50dvh] overflow-y-auto rounded-[18px] border p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-sm font-medium">Что получит модель</span>
                        <Button aria-label="Свернуть" onClick={() => setOpen(false)} size="icon-xs" variant="ghost">
                          <X />
                        </Button>
                      </div>
                      <Preview scene={scene} />
                    </div>
                  </div>
                </div>
              )
            }
          />
          <Hint />
          {phone && <PhoneSheet onOpenChange={setOpen} open={open} scene={scene} />}
        </div>
      }
    >
      <Earlier />
    </ChatShell>
  );
};
