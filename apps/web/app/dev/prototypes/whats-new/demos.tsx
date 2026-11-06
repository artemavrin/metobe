"use client";

import { Button } from "@metobe/ui/components/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@metobe/ui/components/input-group";
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@metobe/ui/components/message-scroller";
import { Switch } from "@metobe/ui/components/switch";
import { cn } from "@metobe/ui/lib/utils";
import type { AskUserOutput } from "@metobe/contracts/chat";
import { ArrowUp, Check, Copy, Plus, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";

import { AskedAnswer, AskPanel } from "@/components/chat/ask-user";
import { ChatHeader } from "@/components/chat/chat-header";
import type { ChatItem, ChatOps } from "@/components/chat/chat-item";
import { NightSky } from "@/components/chat/night-sky";
import { ThreadMap } from "@/components/chat/thread-map";
import type { AskUserPart, OpenAskPart } from "@/lib/ask-user";

import { EASE } from "./parts";

// The product itself on the tour's stage, at its real size: the chat's header and «Поделиться», the model's question
// panel, the thread's map in a real scroller, the new chat's sky. Live — they answer the pointer and the keys. What
// would reach the server (sharing) is a copy of the dialog's body with the same parts and words, kept on the page.
// `data-demo` marks what the autoplay variant points at.

/** Keys typed into a demo stay in it: ←/→ must not turn the tour's page, Esc must not close the window. */
const Contained = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <div className={cn("relative h-full", className)} onKeyDown={(e) => e.stopPropagation()} role="presentation">
    {children}
  </div>
);

/** «Ещё раз» in the stage's corner: the demo back to its start. */
const Again = ({ onClick, className }: { onClick: () => void; className?: string }) => (
  <Button className={cn("text-muted-foreground absolute bottom-3 left-3 z-10", className)} data-demo="again" onClick={onClick} size="xs" variant="ghost">
    <RotateCcw /> Ещё раз
  </Button>
);

// ——— «Поделиться» ———

const NOOP_OPS = (share: () => void, rename: (t: string) => void): ChatOps => ({
  pin: () => undefined,
  remove: () => undefined,
  rename: (_, t) => rename(t),
  share,
});

export const ShareDemo = () => {
  const [chat, setChat] = useState<ChatItem>({ group: "today", id: "demo-share", shared: false, title: "План весенней рассылки" });
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  // This install's own address: the demo shows the link the viewer's colleagues would get.
  const link = `${window.location.origin}/chat/5f0c8a…e21a`;
  return (
    <Contained className="bg-background flex flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3 pr-12" data-demo="share-header">
        <ChatHeader
          chat={chat}
          ops={NOOP_OPS(
            () => setOpen(true),
            (title) => setChat((c) => ({ ...c, title }))
          )}
        />
      </header>
      <div className="relative flex-1 overflow-hidden px-6 pt-5">
        {/* The chat under the header, faint: the share card is what to look at. */}
        <div aria-hidden className="flex flex-col gap-3 opacity-40">
          <div className="bg-muted ml-auto w-fit rounded-2xl px-4 py-2 text-sm">Составь план весенней рассылки для клиентов</div>
          <p className="text-sm">Три письма за две недели: анонс, подборка и напоминание — темы и дни отправки ниже.</p>
        </div>
        {open && (
          <div
            className={cn(
              "bg-popover ring-foreground/10 animate-in fade-in zoom-in-[0.97] absolute inset-x-6 top-4 flex flex-col gap-4 rounded-xl p-4 shadow-lg ring-1 duration-200 motion-reduce:zoom-in-100",
              EASE
            )}
          >
            <div className="flex flex-col gap-1">
              <span className="font-medium">Поделиться чатом</span>
              <span className="text-muted-foreground text-sm">По ссылке чат откроет любой, кто входит в Metobe. Писать в него можете только вы.</span>
            </div>
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <label className="flex min-w-0 flex-1 flex-col" htmlFor="demo-share-switch">
                <span className="text-sm font-medium">Доступ по ссылке</span>
                <span className="text-muted-foreground text-xs">{chat.shared ? "Открыт всем, у кого есть ссылка" : "Сейчас чат видите только вы"}</span>
              </label>
              <Switch
                checked={Boolean(chat.shared)}
                data-demo="share-switch"
                id="demo-share-switch"
                onCheckedChange={(v) => setChat((c) => ({ ...c, shared: v }))}
              />
            </div>
            {chat.shared && (
              <InputGroup className={cn("animate-in fade-in slide-in-from-top-1 duration-200", EASE)}>
                <InputGroupInput aria-label="Ссылка на чат" readOnly value={link} />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    data-demo="share-copy"
                    onClick={() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                    size="xs"
                  >
                    {copied ? <Check /> : <Copy />}
                    {copied ? "Скопировано" : "Скопировать"}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            )}
          </div>
        )}
      </div>
      {(open || chat.shared) && (
        <Again
          onClick={() => {
            setOpen(false);
            setChat((c) => ({ ...c, shared: false }));
          }}
        />
      )}
    </Contained>
  );
};

// ——— Вопрос модели ———

const ASK: OpenAskPart = {
  input: {
    questions: [
      {
        header: "Период",
        options: [
          { description: "Закрыт, данные полные", label: "III квартал" },
          { description: "Последний полный месяц", label: "Октябрь" },
          { description: "Январь — сегодня", label: "С начала года" },
        ],
        question: "За какой период собрать отчёт?",
      },
    ],
  },
  state: "input-available",
  toolCallId: "demo-ask",
  type: "tool-ask_user",
} as OpenAskPart;

export const AskDemo = () => {
  const [output, setOutput] = useState<AskUserOutput | null>(null);
  const [round, setRound] = useState(0);
  const said = output?.skipped ? "сам выберу период" : (output?.answers[ASK.input.questions[0]?.question ?? ""]?.[0] ?? "");
  return (
    <Contained className={cn("bg-background flex flex-col gap-4 px-6 pt-12 pb-5", output ? "justify-end" : "justify-center")}>
      {/* While it asks, the panel needs the room: the thread around it shows once it is answered. */}
      {output && (
        <>
          <div className="bg-muted ml-auto w-fit rounded-2xl px-4 py-2 text-sm">Собери отчёт по продажам</div>
          <p className="text-sm">Уточню период, чтобы не считать лишнего.</p>
        </>
      )}
      {output ? (
        <>
          <AskedAnswer part={{ ...ASK, output, state: "output-available" } as AskUserPart} />
          <p className="text-muted-foreground animate-in fade-in fill-mode-backwards text-sm delay-300 duration-300">
            <span className="animate-pulse motion-reduce:animate-none">Считаю{said ? ` — ${said}` : ""}…</span>
          </p>
          <Again
            className="top-3 bottom-auto"
            onClick={() => {
              setOutput(null);
              setRound((r) => r + 1);
            }}
          />
        </>
      ) : (
        <div data-demo="ask-panel">
          <AskPanel key={round} onAnswer={setOutput} part={ASK} />
        </div>
      )}
    </Contained>
  );
};

// ——— Карта разговора ———

const THREAD = [
  ["Составь план весенней рассылки", "Три письма за две недели: анонс, подборка и напоминание."],
  ["Какие темы писем сработают лучше?", "Короткие, с выгодой в первых словах — вот пять вариантов на выбор."],
  ["Сократи второе письмо вдвое", "Готово: осталось 90 слов, главное — в первом абзаце."],
  ["Сделай версию для соцсетей", "Три поста под разные площадки, с подписями к картинкам."],
  ["Когда лучше отправлять?", "Утром во вторник или четверг — рабочие письма тогда открывают чаще."],
  ["Сведи всё в одну таблицу", "Таблица ниже: письмо, тема, день отправки и кто отвечает."],
] as const;

const ITEMS = THREAD.map(([question, answer], i) => ({ answer, answerId: `a${i}`, id: `q${i}`, question }));

export const MapDemo = () => (
  <Contained className="bg-background">
    <MessageScrollerProvider defaultScrollPosition="last-anchor">
      <MessageScroller>
        <MessageScrollerViewport aria-label="Разговор">
          <MessageScrollerContent className="mx-auto w-full max-w-[420px] px-2 py-6 text-sm">
            {THREAD.flatMap(([q, a], i) => [
              <MessageScrollerItem key={`q${i}`} messageId={`q${i}`} scrollAnchor>
                <div className="bg-muted ml-auto w-fit max-w-[85%] rounded-2xl px-4 py-2">{q}</div>
              </MessageScrollerItem>,
              <MessageScrollerItem key={`a${i}`} messageId={`a${i}`}>
                <p className="leading-relaxed">{a}</p>
                <div aria-hidden className="mt-3 flex flex-col gap-2">
                  <span className="bg-muted h-2 w-11/12 rounded-full" />
                  <span className="bg-muted h-2 w-4/5 rounded-full" />
                  <span className="bg-muted h-2 w-2/3 rounded-full" />
                </div>
              </MessageScrollerItem>,
            ])}
          </MessageScrollerContent>
        </MessageScrollerViewport>
      </MessageScroller>
      <ThreadMap column={420} items={ITEMS} />
    </MessageScrollerProvider>
  </Contained>
);

// ——— Новый чат ———

const greetingOf = (hour: number) => {
  if (hour < 5 || hour >= 23) return "Доброй ночи";
  if (hour < 12) return "Доброе утро";
  if (hour < 18) return "Добрый день";
  return "Добрый вечер";
};

export const WelcomeDemo = () => {
  const composer = useRef<HTMLDivElement>(null);
  const now = new Date();
  const greeting = greetingOf(now.getHours());
  const today = new Intl.DateTimeFormat("ru", { day: "numeric", month: "long", weekday: "long" }).format(now);
  return (
    <Contained className="bg-background flex flex-col items-center justify-end overflow-hidden px-8 pb-6">
      <NightSky composer={composer} />
      <div className="relative mb-auto flex flex-col items-center pt-14 text-center">
        <p className="text-muted-foreground mb-2 text-[10px] font-medium tracking-[0.22em] uppercase">{today}</p>
        {/* The viewer's own hour, and — in the product — their own name; nothing of anyone's data here. */}
        <p className="text-3xl font-semibold tracking-tight">{greeting}</p>
        <p className="text-muted-foreground mt-2 text-sm">Сделайте сегодня одну важную вещь.</p>
      </div>
      <div className="bg-background relative flex w-full items-center gap-1 rounded-3xl border p-1.5 shadow-xs" ref={composer}>
        <span className="text-muted-foreground grid size-8 place-items-center">
          <Plus className="size-4" />
        </span>
        <span className="text-muted-foreground flex-1 px-1 text-sm">Спросите что-нибудь…</span>
        <span className="bg-primary/60 text-primary-foreground grid size-8 place-items-center rounded-full">
          <ArrowUp className="size-4" />
        </span>
      </div>
    </Contained>
  );
};

export const DEMOS: Record<string, () => React.ReactNode> = {
  ask: AskDemo,
  map: MapDemo,
  share: ShareDemo,
  welcome: WelcomeDemo,
};
