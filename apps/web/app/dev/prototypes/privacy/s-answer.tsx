"use client";

import { Button } from "@metobe/ui/components/button";
import { Frame, FramePanel } from "@metobe/ui/components/reui/frame";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@metobe/ui/components/sheet";
import { Tooltip, TooltipTrigger } from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import { ChevronDown, Copy, FileSpreadsheet, RefreshCw, Server, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { useState } from "react";

import { useProto } from "../memory/frame";
import { ATTACHMENT, CLOUD, LOCAL, QUESTION, RAW_ANSWER, mask, unmaskAnswer, uniqueHidden, valuesWord } from "./data";
import { ChatShell, UserBubble, usePhone } from "./frame";
import { ModelView, RestoringStatus } from "./model-view";
import { EASE, ShieldCount, Tip, useStream } from "./parts";

// Сцена «Ответ» (З5). В подвале ответа щит с числом скрытого; по нажатию — «Что увидела модель». Спорное — где панель:
//   1 «Под ответом» — раскрывается на месте, под подвалом, лента не уходит;
//   2 «Сбоку» — шторка справа (на телефоне — снизу), ответ остаётся на виду слева.
// Ручки: `st=done|stream` (поток: «Восстанавливаю данные», пока шлюз держит метку), `src=cloud|local`, `att=no|yes`.

const QUESTION_PIECES = mask(QUESTION).pieces;
const ANSWER_PIECES = unmaskAnswer(RAW_ANSWER);
const COUNT = uniqueHidden(QUESTION_PIECES).length;

/** Ответ в ленте: значения уже восстановлены, человек видит обычный текст. */
const AnswerText = ({ pieces }: { pieces: typeof ANSWER_PIECES }) => (
  <p className="text-sm leading-7 whitespace-pre-wrap">
    {pieces.map((p, i) => (
      // oxlint-disable-next-line react/no-array-index-key -- куски текста не переставляются
      <span key={i}>{typeof p === "string" ? p : p.original}</span>
    ))}
  </p>
);

const Action = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <Button aria-label={label} className="text-muted-foreground hover:text-foreground [&_svg]:size-3.5" size="icon-xs" variant="ghost">
    {children}
  </Button>
);

/** Подвал ответа, как `AnswerFooter`: модель, время, копировать, оценки, повтор — и щит с числом скрытого. */
const Footer = ({ open, onOpen, local, chevron }: { open: boolean; onOpen: () => void; local: boolean; chevron: boolean }) => {
  const model = local ? LOCAL : CLOUD;
  const label = local ? "Не покидало сервер" : `Скрыто ${valuesWord(COUNT)}`;
  return (
    <div className="text-muted-foreground -mt-3 flex h-6 items-center gap-0.5 text-xs font-medium">
      <span className="mr-1 flex items-center gap-1.5">
        <span>{model.name}</span>
        <span aria-hidden="true">·</span>
        <span>12:40</span>
      </span>
      <Action label="Копировать">
        <Copy />
      </Action>
      <Action label="Полезно">
        <ThumbsUp />
      </Action>
      <Action label="Бесполезно">
        <ThumbsDown />
      </Action>
      <Action label="Ответить заново">
        <RefreshCw />
      </Action>
      <Tooltip>
        <TooltipTrigger
          delay={500}
          render={
            <Button
              aria-expanded={open}
              aria-label={label}
              className={cn(
                "text-muted-foreground hover:text-foreground h-6 gap-1 px-1.5 text-xs transition-[color,background-color,scale] duration-150 active:scale-[0.97]",
                open && "bg-muted text-foreground"
              )}
              onClick={onOpen}
              size="xs"
              variant="ghost"
            />
          }
        >
          {local ? <Server className="size-3.5" /> : <ShieldCount count={COUNT} />}
          {chevron && <ChevronDown className={cn("size-3 transition-transform duration-200", EASE, open && "rotate-180")} />}
        </TooltipTrigger>
        <Tip>{label}</Tip>
      </Tooltip>
    </div>
  );
};

/** Раскрытие на месте: строки сетки, без замера высоты. */
const Expand = ({ open, children }: { open: boolean; children: React.ReactNode }) => (
  <div
    className={cn(
      "grid transition-[grid-template-rows,opacity] motion-reduce:[transition-property:opacity]",
      EASE,
      open ? "grid-rows-[1fr] opacity-100 duration-250" : "grid-rows-[0fr] opacity-0 duration-150"
    )}
    inert={!open}
  >
    <div className="min-h-0 overflow-hidden">{children}</div>
  </div>
);

const useScene = () => {
  const { knobs } = useProto();
  const local = knobs.src === "local";
  const streaming = knobs.st === "stream";
  const att = knobs.att === "yes";
  const stream = useStream(ANSWER_PIECES, streaming);
  return { att, local, stream, streaming };
};

type Scene = ReturnType<typeof useScene>;

const Thread = ({
  scene,
  panel,
  open,
  onOpen,
  chevron,
}: {
  scene: Scene;
  panel?: React.ReactNode;
  open: boolean;
  onOpen: () => void;
  chevron: boolean;
}) => {
  const { att, local, stream } = scene;
  return (
    <>
      <UserBubble>
        {att && (
          <span className="bg-background/70 mb-2 flex w-fit items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs">
            <FileSpreadsheet className="size-3.5 text-emerald-600" />
            {ATTACHMENT}
          </span>
        )}
        {QUESTION}
      </UserBubble>
      <div className="flex flex-col gap-3">
        <AnswerText pieces={stream.shown} />
        {!stream.done && (stream.holding ? <RestoringStatus /> : <span className="h-5" />)}
        {stream.done && <Footer chevron={chevron} local={local} onOpen={onOpen} open={open} />}
        {panel}
      </div>
    </>
  );
};

const View = ({ scene }: { scene: Scene }) => {
  const { att, local, stream } = scene;
  return (
    <ModelView
      answer={{ done: stream.done, holding: stream.holding, pieces: stream.shown }}
      attachment={att ? ATTACHMENT : undefined}
      model={local ? LOCAL : CLOUD}
      question={QUESTION_PIECES}
    />
  );
};

/** Открыта ли панель: своё состояние, а ручка `open` (она приходит из адреса после первого кадра) открывает её. */
const useKnobOpen = (want: boolean) => {
  const [open, setOpen] = useState(want);
  const [was, setWas] = useState(want);
  if (want !== was) {
    setWas(want);
    setOpen(want);
  }
  return [open, setOpen] as const;
};

const panelTitle = (scene: Scene) => (scene.local ? "Что получила модель" : "Что увидела модель");

/** 1 · «Под ответом». */
export const AnswerInline = () => {
  const { knobs } = useProto();
  const scene = useScene();
  // Поток показывает панель сразу открытой: так видно, как восстанавливается ответ.
  const [open, setOpen] = useKnobOpen(knobs.open === "1" || knobs.st === "stream");
  return (
    <ChatShell composer={<ComposerStub />}>
      <Thread
        chevron
        scene={scene}
        onOpen={() => setOpen(!open)}
        open={open}
        panel={
          <Expand open={open}>
            <Frame className="mt-1" spacing="sm">
              <div className="flex items-center justify-between px-2 pt-0.5">
                <span className="text-sm font-medium">{panelTitle(scene)}</span>
                <Button aria-label="Свернуть" onClick={() => setOpen(false)} size="icon-xs" variant="ghost">
                  <X />
                </Button>
              </div>
              <FramePanel>
                <View scene={scene} />
              </FramePanel>
            </Frame>
          </Expand>
        }
      />
    </ChatShell>
  );
};

/** 2 · «Сбоку»: шторка справа; на телефоне — снизу, по кривой iOS-шторок. */
export const AnswerSheet = () => {
  const { knobs } = useProto();
  const scene = useScene();
  const phone = usePhone();
  const [open, setOpen] = useKnobOpen(knobs.open === "1" || knobs.st === "stream");
  return (
    <ChatShell composer={<ComposerStub />}>
      {/* Сбоку панель не закрывает ленту: без затемнения, ответ остаётся на виду. */}
      {!phone && <style>{"[data-slot=sheet-overlay] { display: none }"}</style>}
      <Thread chevron={false} scene={scene} onOpen={() => setOpen(true)} open={open} />
      <Sheet modal={phone} onOpenChange={setOpen} open={open}>
        <SheetContent
          className={cn(
            "@container gap-0",
            phone
              ? "max-h-[88dvh] rounded-t-2xl duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] data-[side=bottom]:data-ending-style:translate-y-full data-[side=bottom]:data-starting-style:translate-y-full data-ending-style:opacity-100 data-starting-style:opacity-100"
              : "duration-200 data-[side=right]:w-[460px] data-[side=right]:sm:max-w-[460px]"
          )}
          side={phone ? "bottom" : "right"}
        >
          {phone && <span aria-hidden="true" className="bg-foreground/15 mx-auto mt-2 h-1 w-9 shrink-0 rounded-full" />}
          <SheetHeader className="pb-2">
            <SheetTitle>{panelTitle(scene)}</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 overflow-y-auto px-4 pb-6">
            <View scene={scene} />
          </div>
        </SheetContent>
      </Sheet>
    </ChatShell>
  );
};

/** Поле ввода внизу ленты — как в чате, без дела в этой сцене. */
export const ComposerStub = () => (
  <div className="bg-muted/70 dark:bg-muted/40 border-border/70 text-muted-foreground flex h-12 items-center rounded-[24px] border px-4 text-sm">
    Спросите что-нибудь
  </div>
);
