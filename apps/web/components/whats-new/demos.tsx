"use client";

import type { AskUserOutput } from "@metobe/contracts/chat";
import { Button } from "@metobe/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@metobe/ui/components/input-group";
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@metobe/ui/components/message-scroller";
import { Switch } from "@metobe/ui/components/switch";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowUp, Check, Copy, Plus, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { AskedAnswer, AskPanel } from "@/components/chat/ask-user";
import { ChatHeader } from "@/components/chat/chat-header";
import type { ChatItem, ChatOps } from "@/components/chat/chat-item";
import { CompactionCard, CompactOffer } from "@/components/chat/compaction";
import { NightSky } from "@/components/chat/night-sky";
import { ThreadMap } from "@/components/chat/thread-map";
import type { AskUserPart, OpenAskPart } from "@/lib/ask-user";

// The product itself on the tour's stage (docs/RELEASE.md, «Демо, а не скриншоты»): the chat's header and
// «Поделиться», the model's question panel, the thread's map in a real scroller, the new chat's sky — at their real
// size, in the reader's language, with neutral examples. What would reach the server (sharing) is a copy of the
// dialog's body with the same parts and words, kept on the page. `data-demo` marks what the cursor points at.

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

/** Keys typed into a demo stay in it: ←/→ must not turn the tour's page, Esc must not close the window. */
const Contained = ({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) => (
  <div
    className={cn("relative h-full", className)}
    onKeyDown={(e) => e.stopPropagation()}
    role="presentation"
  >
    {children}
  </div>
);

/** «Ещё раз»: the demo back to its start. */
const Again = ({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) => {
  const t = useTranslations("whatsNew");
  return (
    <Button
      className={cn(
        "text-muted-foreground absolute bottom-3 left-3 z-10",
        className
      )}
      onClick={onClick}
      size="xs"
      variant="ghost"
    >
      <RotateCcw /> {t("again")}
    </Button>
  );
};

// ——— Share ———

/** The header's pin and delete do nothing in a demo. */
const nothing = () => null;

const opsOf = (
  share: () => void,
  rename: (title: string) => void
): ChatOps => ({
  pin: nothing,
  remove: nothing,
  rename: (_, title) => rename(title),
  share,
});

const SharePanel = ({
  shared,
  onShared,
}: {
  shared: boolean;
  onShared: (shared: boolean) => void;
}) => {
  const t = useTranslations("chat.share");
  const [copied, setCopied] = useState(false);
  // This install's own address: the link the reader's colleagues would get.
  const link = `${window.location.origin}/chat/5f0c8a…e21a`;
  return (
    <div
      className={cn(
        "bg-popover ring-foreground/10 animate-in fade-in zoom-in-[0.97] motion-reduce:zoom-in-100 absolute inset-x-6 top-4 flex flex-col gap-4 rounded-xl p-4 shadow-lg ring-1 duration-200",
        EASE
      )}
    >
      <div className="flex flex-col gap-1">
        <span className="font-medium">{t("title")}</span>
        <span className="text-muted-foreground line-clamp-2 text-sm">
          {t("text")}
        </span>
      </div>
      <div className="flex items-center gap-3 rounded-lg border p-3">
        <label
          className="flex min-w-0 flex-1 flex-col"
          htmlFor="whats-new-share"
        >
          <span className="text-sm font-medium">{t("toggle")}</span>
          <span className="text-muted-foreground text-xs">
            {shared ? t("on") : t("off")}
          </span>
        </label>
        <Switch
          checked={shared}
          data-demo="share-switch"
          id="whats-new-share"
          onCheckedChange={onShared}
        />
      </div>
      {shared && (
        <InputGroup
          className={cn(
            "animate-in fade-in slide-in-from-top-1 duration-200",
            EASE
          )}
        >
          <InputGroupInput aria-label={t("link")} readOnly value={link} />
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
              {copied ? t("copied") : t("copy")}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      )}
    </div>
  );
};

const ShareDemo = () => {
  const t = useTranslations("whatsNew.demo");
  const [chat, setChat] = useState<ChatItem>({
    group: "today",
    id: "whats-new-share",
    shared: false,
    title: t("chatTitle"),
  });
  const [open, setOpen] = useState(false);
  return (
    <Contained className="bg-background flex flex-col">
      <header
        className="flex h-12 shrink-0 items-center gap-2 border-b px-3 pr-12"
        data-demo="share-header"
      >
        <ChatHeader
          chat={chat}
          ops={opsOf(
            () => setOpen(true),
            (title) => setChat((c) => ({ ...c, title }))
          )}
        />
      </header>
      <div className="relative flex-1 overflow-hidden px-6 pt-5">
        {/* The chat under the header, faint: the share card is what to look at. */}
        <div aria-hidden className="flex flex-col gap-3 opacity-40">
          <div className="bg-muted ml-auto w-fit rounded-2xl px-4 py-2 text-sm">
            {t("question")}
          </div>
          <p className="text-sm">{t("answer")}</p>
        </div>
        {open && (
          <SharePanel
            onShared={(shared) => setChat((c) => ({ ...c, shared }))}
            shared={Boolean(chat.shared)}
          />
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

// ——— The model asks ———

const AskDemo = () => {
  const t = useTranslations("whatsNew.demo");
  const [output, setOutput] = useState<AskUserOutput | null>(null);
  const [round, setRound] = useState(0);
  const part = useMemo(
    () =>
      ({
        input: {
          questions: [
            {
              header: t("periodHeader"),
              options: t.raw("options") as {
                label: string;
                description: string;
              }[],
              question: t("period"),
            },
          ],
        },
        state: "input-available",
        toolCallId: "whats-new-ask",
        type: "tool-ask_user",
      }) as OpenAskPart,
    [t]
  );
  const said = output?.answers[t("period")]?.[0];
  return (
    <Contained
      className={cn(
        "bg-background flex flex-col gap-4 px-6 pt-12 pb-5",
        output ? "justify-end" : "justify-center"
      )}
    >
      {/* While it asks, the panel needs the room: the thread around it shows once it is answered. */}
      {output ? (
        <>
          <div className="bg-muted ml-auto w-fit rounded-2xl px-4 py-2 text-sm">
            {t("report")}
          </div>
          <p className="text-sm">{t("lead")}</p>
          <AskedAnswer
            part={{ ...part, output, state: "output-available" } as AskUserPart}
          />
          <p className="text-muted-foreground animate-in fade-in fill-mode-backwards text-sm delay-300 duration-300">
            <span className="animate-pulse motion-reduce:animate-none">
              {said ? t("working", { answer: said }) : t("workingSkipped")}
            </span>
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
        <AskPanel key={round} onAnswer={setOutput} part={part} />
      )}
    </Contained>
  );
};

// ——— The thread's map ———

const MapDemo = () => {
  const t = useTranslations("whatsNew.demo");
  const thread = t.raw("thread") as [string, string][];
  const items = thread.map(([question, answer], i) => ({
    answer,
    answerId: `a${i}`,
    id: `q${i}`,
    question,
  }));
  return (
    <Contained className="bg-background">
      <MessageScrollerProvider defaultScrollPosition="last-anchor">
        <MessageScroller>
          <MessageScrollerViewport aria-label={t("threadLabel")}>
            <MessageScrollerContent className="mx-auto w-full max-w-[420px] px-2 py-6 text-sm">
              {thread.flatMap(([q, a], i) => [
                <MessageScrollerItem
                  key={`q${q}`}
                  messageId={`q${i}`}
                  scrollAnchor
                >
                  <div className="bg-muted ml-auto w-fit max-w-[85%] rounded-2xl px-4 py-2">
                    {q}
                  </div>
                </MessageScrollerItem>,
                <MessageScrollerItem key={`a${q}`} messageId={`a${i}`}>
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
        <ThreadMap column={420} items={items} />
      </MessageScrollerProvider>
    </Contained>
  );
};

// ——— Compact a long chat ———

/** The end of a long chat, the offer under its last answer, and — a click on «Сжать чат» — the summary in its place. */
const CompactDemo = () => {
  const t = useTranslations("whatsNew.demo");
  const thread = (t.raw("thread") as [string, string][]).slice(-2);
  const [stage, setStage] = useState<"offer" | "writing" | "done">("offer");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const compact = () => {
    setStage("writing");
    // The service model at work, played: the summary comes after a breath.
    timer.current = setTimeout(() => setStage("done"), 1400);
  };
  return (
    <Contained className="bg-background">
      <div className="flex h-full flex-col justify-end gap-4 overflow-hidden px-6 pb-14">
        <div aria-hidden className="flex flex-col gap-3 opacity-40">
          {thread.map(([q, a]) => (
            <div className="flex flex-col gap-3" key={q}>
              <div className="bg-muted ml-auto w-fit max-w-[85%] rounded-2xl px-4 py-2 text-sm">
                {q}
              </div>
              <p className="text-sm">{a}</p>
            </div>
          ))}
        </div>
        <div data-demo="compact-offer">
          {stage === "done" ? (
            <CompactionCard
              data={{
                messages: t.raw("compact.messages") as number,
                summary: t("compact.summary"),
              }}
            />
          ) : (
            <CompactOffer
              onCompact={compact}
              onLater={() => setStage("done")}
              stepTokens={180_000}
              writing={stage === "writing"}
            />
          )}
        </div>
      </div>
      {stage !== "offer" && (
        <Again
          onClick={() => {
            if (timer.current) {
              clearTimeout(timer.current);
            }
            setStage("offer");
          }}
        />
      )}
    </Contained>
  );
};

// ——— A new chat ———

const greetingOf = (hour: number) => {
  if (hour < 5 || hour >= 23) {
    return "night";
  }
  if (hour < 12) {
    return "morning";
  }
  return hour < 18 ? "day" : "evening";
};

const GreetingDemo = () => {
  const t = useTranslations("whatsNew.demo");
  const composer = useRef<HTMLDivElement>(null);
  // The reader's own hour and day; nothing of anyone's data.
  const now = new Date();
  const today = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "long",
    weekday: "long",
  }).format(now);
  return (
    <Contained className="bg-background flex flex-col items-center justify-end overflow-hidden px-8 pb-6">
      <NightSky composer={composer} />
      <div className="relative mb-auto flex flex-col items-center pt-14 text-center">
        <p className="text-muted-foreground mb-2 text-[10px] font-medium tracking-[0.22em] uppercase">
          {today}
        </p>
        <p className="text-3xl font-semibold tracking-tight">
          {t(`greetings.${greetingOf(now.getHours())}`)}
        </p>
        <p className="text-muted-foreground mt-2 text-sm">{t("line")}</p>
      </div>
      <div
        className="bg-background relative flex w-full items-center gap-1 rounded-3xl border p-1.5 shadow-xs"
        ref={composer}
      >
        <span className="text-muted-foreground grid size-8 place-items-center">
          <Plus className="size-4" />
        </span>
        <span className="text-muted-foreground flex-1 px-1 text-sm">
          {t("placeholder")}
        </span>
        <span className="bg-primary/60 text-primary-foreground grid size-8 place-items-center rounded-full">
          <ArrowUp className="size-4" />
        </span>
      </div>
    </Contained>
  );
};

/** A change's demo by its id in the release notes; a change without one has no page of its own. */
export const DEMOS: Record<string, () => ReactNode> = {
  askUser: AskDemo,
  compactChat: CompactDemo,
  greeting: GreetingDemo,
  shareChat: ShareDemo,
  threadMap: MapDemo,
};
