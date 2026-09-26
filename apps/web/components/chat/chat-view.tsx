"use client";

import { useChat } from "@ai-sdk/react";
import { chatTitleFrom } from "@metobe/contracts/chat";
import type { ChatMessage } from "@metobe/contracts/chat";
import type { ModelLabel } from "@metobe/core/chat";
import { Button } from "@metobe/ui/components/button";
import { cn } from "@metobe/ui/lib/utils";
import { DefaultChatTransport } from "ai";
import { TriangleAlert } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { useTouchChat } from "@/components/chat/chat-shell";
import { Composer } from "@/components/chat/composer";
import {
  AssistantMessage,
  PendingAnswer,
  UserMessage,
} from "@/components/chat/messages";
import { PickerDataProvider } from "@/components/chat/picker/data";
import type { PickerModel } from "@/components/chat/picker/data";
import { useFavorites } from "@/components/chat/picker/use-favorites";
import { chatProblem } from "@/lib/chat-errors";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
/** The composer's move to the bottom: a spring with a hint of bounce, for a large move that must feel physical. */
const SPRING = { bounce: 0.1, duration: 0.5, type: "spring" } as const;
const SNAP = { duration: 0 } as const;

// The screen's own entrance: an empty chat opens with the greeting rising in, the composer 60ms after it. A CSS
// animation (off the main thread, smooth while the page hydrates) on `translate`, so it never fights the composer's
// layout transform; `backwards` keeps both hidden through the delay and leaves nothing behind.
const SCREEN_CSS = `
@keyframes chat-rise { from { opacity: 0; translate: 0 8px; } }
@keyframes chat-rise-fade { from { opacity: 0; } }
.chat-rise { animation: chat-rise 300ms cubic-bezier(0.23, 1, 0.32, 1) backwards; }
.chat-rise-next { animation-delay: 60ms; }
@media (prefers-reduced-motion: reduce) { .chat-rise { animation-name: chat-rise-fade; } }
`;

/** A picker model named the way the thread's bylines read it. */
const asLabel = (m: PickerModel): ModelLabel => ({
  id: m.id,
  providerLogo: m.logo ?? null,
  providerTitle: m.makerTitle,
  title: m.title,
});

/** A message's time as the client knows it until the server's copy comes back with its own. */
const stamp = () => ({ createdAt: new Date().toISOString() });

const ChatError = ({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) => {
  const t = useTranslations("chat");
  const problem = chatProblem(error);
  return (
    <div className="flex items-center gap-3" role="alert">
      <TriangleAlert className="text-destructive size-[22px] shrink-0 p-0.5" />
      <span className="text-muted-foreground min-w-0 flex-1">
        {t(`errors.${problem}`)}
      </span>
      {problem === "unauthorized" ? (
        <Button
          nativeButton={false}
          render={<Link href="/login" />}
          size="sm"
          variant="outline"
        >
          {t("signIn")}
        </Button>
      ) : (
        problem !== "forbidden" && (
          <Button onClick={onRetry} size="sm" variant="outline">
            {t("retry")}
          </Button>
        )
      )}
    </div>
  );
};

/**
 * A chat: the thread and the composer in one tree. An empty chat has the greeting and the composer in the middle;
 * when the first message goes, the same composer travels to its place at the bottom (a layout animation) and keeps
 * its focus, instead of one vanishing in the middle and another appearing below.
 */
export const ChatView = ({
  id,
  initialMessages,
  model: initialModel,
  models,
  favorites: initialFavorites,
  recent,
  labels,
  greeting,
}: {
  id: string;
  initialMessages: ChatMessage[];
  /** The model the chat opens with; the chip picks another. */
  model: PickerModel;
  /** Models in chat, the user's favorites and recent models — what the picker shows. */
  models: PickerModel[];
  favorites: string[];
  recent: string[];
  /** Names of models that wrote answers here but have left the chat since. */
  labels: ModelLabel[];
  /** A new chat greets the user; an existing one opens on its history. */
  greeting?: string;
}) => {
  const reduce = useReducedMotion() ?? false;
  const touch = useTouchChat();
  const [model, setModel] = useState(initialModel);
  const favorites = useFavorites(initialFavorites);
  const titled = useRef<string | null>(null);
  const transport = useMemo(
    () =>
      new DefaultChatTransport<ChatMessage>({
        api: "/api/chat",
        // Only the newest message goes; the history is the server's (ARCH §6).
        prepareSendMessagesRequest: ({ body, id: chatId, messages }) => ({
          body: {
            id: chatId,
            message: messages.at(-1),
            modelId: body?.modelId,
          },
        }),
      }),
    []
  );
  const { clearError, error, messages, regenerate, sendMessage, status, stop } =
    useChat<ChatMessage>({
      generateId: () => crypto.randomUUID(),
      id,
      messages: initialMessages,
      // A new chat's name from the titles model: the sidebar shows it as soon as it comes.
      onData: (part) => {
        if (part.type === "data-title") {
          titled.current = part.data;
          touch({ id, title: part.data });
        }
      },
      transport,
    });
  const busy = status === "submitted" || status === "streaming";
  const empty = messages.length === 0;

  // When an answer starts, the server has the chat: a new one gets its address without a reload, and the chat
  // goes to the top of the sidebar.
  const fresh = useRef(initialMessages.length === 0);
  const touched = useRef(false);
  useEffect(() => {
    if (status !== "streaming") {
      touched.current = false;
      return;
    }
    if (touched.current) {
      return;
    }
    touched.current = true;
    if (fresh.current) {
      fresh.current = false;
      window.history.replaceState(null, "", `/chat/${id}`);
    }
    const first = messages.find((m) => m.role === "user");
    const text =
      first?.parts
        .flatMap((p) => (p.type === "text" ? [p.text] : []))
        .join(" ") ?? "";
    touch({ id, title: titled.current ?? chatTitleFrom(text) });
  }, [status, messages, id, touch]);

  // The thread follows its growth — a new message, a streaming answer — while the user is at its end; scrolling up
  // to read stops that, sending brings it back.
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  useEffect(() => {
    const el = scroller.current;
    const inner = content.current;
    if (!el || !inner) {
      return;
    }
    const follow = new ResizeObserver(() => {
      if (pinned.current) {
        el.scrollTop = el.scrollHeight;
      }
    });
    follow.observe(inner);
    return () => follow.disconnect();
  }, []);

  const send = (text: string) => {
    pinned.current = true;
    clearError();
    void sendMessage(
      { metadata: stamp(), text },
      { body: { modelId: model.id } }
    );
  };
  // An edited message replaces its old self and drops what followed; the server does the same with its copy.
  const edit = (messageId: string, text: string) => {
    pinned.current = true;
    clearError();
    void sendMessage(
      { messageId, metadata: stamp(), text },
      { body: { modelId: model.id } }
    );
  };
  // An answer again, by the model in the chip, from the user's message before it.
  const regenerateFrom = (messageId: string) => {
    clearError();
    void regenerate({ body: { modelId: model.id }, messageId });
  };
  const retry = () => {
    clearError();
    void regenerate({ body: { modelId: model.id } });
  };
  const labelOf = (m: ChatMessage) => {
    const picked = models.find((x) => x.id === m.metadata?.modelId);
    return picked
      ? asLabel(picked)
      : labels.find((l) => l.id === m.metadata?.modelId);
  };
  const last = messages.at(-1);

  return (
    <PickerDataProvider models={models} recent={recent}>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <style>{SCREEN_CSS}</style>
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto px-4 md:px-6",
            !empty && "py-6"
          )}
          onScroll={(e) => {
            const el = e.currentTarget;
            pinned.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 64;
          }}
          ref={scroller}
        >
          <div
            className="mx-auto flex max-w-4xl flex-col gap-6 text-sm"
            ref={content}
          >
            {!empty && (
              <>
                {messages.map((m) =>
                  m.role === "user" ? (
                    <UserMessage
                      key={m.id}
                      message={m}
                      onEdit={busy ? undefined : (text) => edit(m.id, text)}
                    />
                  ) : (
                    <AssistantMessage
                      key={m.id}
                      label={labelOf(m)}
                      message={m}
                      onRegenerate={
                        busy ? undefined : () => regenerateFrom(m.id)
                      }
                      streaming={status === "streaming" && m.id === last?.id}
                    />
                  )
                )}
                {status === "submitted" && last?.role === "user" && (
                  <PendingAnswer />
                )}
                {error && !busy && <ChatError error={error} onRetry={retry} />}
              </>
            )}
          </div>
        </div>
        <AnimatePresence initial={false} mode="popLayout">
          {empty && greeting && (
            <motion.h1
              className="chat-rise w-full px-6 pb-6 text-center text-2xl font-semibold tracking-tight"
              exit={{
                opacity: 0,
                transition: { duration: 0.15, ease: EASE_OUT },
              }}
              key="greeting"
            >
              {greeting}
            </motion.h1>
          )}
        </AnimatePresence>
        <motion.div
          className={cn(
            "chat-rise chat-rise-next w-full px-4 md:px-6",
            !empty && "pb-4"
          )}
          layout="position"
          transition={reduce ? SNAP : SPRING}
        >
          <div className="mx-auto max-w-4xl">
            <Composer
              busy={busy}
              favorites={favorites}
              home={empty}
              model={model}
              onModel={setModel}
              onSend={send}
              onStop={stop}
            />
          </div>
        </motion.div>
        {/* Below an empty chat's composer: its share of the free space and a bit more, so the pair sits above the middle */}
        {empty && <div className="flex-1 pb-[14vh]" />}
      </div>
    </PickerDataProvider>
  );
};
