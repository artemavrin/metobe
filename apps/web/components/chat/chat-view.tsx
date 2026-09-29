"use client";

import { useChat } from "@ai-sdk/react";
import { chatTitleFrom } from "@metobe/contracts/chat";
import type { ChatMessage } from "@metobe/contracts/chat";
import type { ModelLabel } from "@metobe/core/chat";
import type { ChatServer } from "@metobe/core/mcp";
import { Button } from "@metobe/ui/components/button";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@metobe/ui/components/message-scroller";
import { cn } from "@metobe/ui/lib/utils";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai";
import { ArrowDown, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { useTouchChat } from "@/components/chat/chat-shell";
import { Composer } from "@/components/chat/composer";
import {
  AssistantMessage,
  ModelSwitch,
  UserMessage,
} from "@/components/chat/messages";
import { PickerDataProvider } from "@/components/chat/picker/data";
import type { PickerModel } from "@/components/chat/picker/data";
import { useFavorites } from "@/components/chat/picker/use-favorites";
import { chatProblem } from "@/lib/chat-errors";
import { answeredAsk, connectionsOf } from "@/lib/connection-asks";
import { threadRows } from "@/lib/thread-rows";
import type { ThreadRow } from "@/lib/thread-rows";

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

/** The user's yes or no on each asked tool call of an answer. */
const decisionsOf = (answer: ChatMessage) =>
  answer.parts.flatMap((p) =>
    p.type === "dynamic-tool" && p.state === "approval-responded"
      ? [
          {
            approved: p.approval.approved,
            id: p.approval.id,
            ...(p.approval.reason ? { reason: p.approval.reason } : {}),
          },
        ]
      : []
  );

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
  id: givenId,
  initialMessages,
  model: initialModel,
  models,
  favorites: initialFavorites,
  recent,
  labels,
  greeting,
  servers: initialServers,
}: {
  /** An existing chat's id; a new chat makes its own, once, in the browser. */
  id?: string;
  initialMessages: ChatMessage[];
  /** The model the chat opens with; the chip picks another. */
  model: PickerModel;
  /** Models in chat, the user's favorites and recent models — what the picker shows. */
  models: PickerModel[];
  favorites: string[];
  recent: string[];
  /** The MCP servers the user may mention here. */
  servers: ChatServer[];
  /** Names of models that wrote answers here but have left the chat since. */
  labels: ModelLabel[];
  /** A new chat greets the user; an existing one opens on its history. */
  greeting?: string;
}) => {
  const t = useTranslations("chat");
  // oxlint-disable-next-line react/hook-use-state -- made once and never changed: no setter to name
  const [id] = useState(() => givenId ?? crypto.randomUUID());
  const reduce = useReducedMotion() ?? false;
  const touch = useTouchChat();
  const [model, setModel] = useState(initialModel);
  // A server connected from the chat is ready at once, without a reload (a new chat would lose its draft).
  const [servers, setServers] = useState(initialServers);
  const serverReady = (serverId: string) =>
    setServers((list) =>
      list.map((s) =>
        s.id === serverId ? { ...s, signIn: "ready" as const } : s
      )
    );
  const favorites = useFavorites(initialFavorites);
  const titled = useRef<string | null>(null);
  // The titles model is naming this chat: from the server's «naming» to its title or the end of the answer.
  const naming = useRef(false);
  const transport = useMemo(
    () =>
      new DefaultChatTransport<ChatMessage>({
        api: "/api/chat",
        // Only the newest message goes; the history is the server's (ARCH §6). After «ask first?», only the
        // decisions go — the server applies them to its own copy of the answer.
        prepareSendMessagesRequest: ({ body, id: chatId, messages }) => {
          const last = messages.at(-1);
          const modelId = body?.modelId;
          return {
            body:
              last?.role === "assistant"
                ? {
                    approvals: {
                      answers: decisionsOf(last),
                      connections: connectionsOf(last),
                      messageId: last.id,
                    },
                    id: chatId,
                    modelId,
                  }
                : {
                    id: chatId,
                    message: last,
                    modelId,
                  },
          };
        },
      }),
    []
  );
  const {
    addToolApprovalResponse,
    addToolOutput,
    clearError,
    error,
    messages,
    regenerate,
    sendMessage,
    status,
    stop,
  } = useChat<ChatMessage>({
    generateId: () => crypto.randomUUID(),
    id,
    messages: initialMessages,
    // A new chat's name from the titles model: the sidebar shows it as soon as it comes.
    onData: (part) => {
      if (part.type === "data-naming") {
        naming.current = true;
        touch({ id, naming: true });
      } else if (part.type === "data-title") {
        titled.current = part.data;
        naming.current = false;
        touch({ id, naming: false, title: part.data });
      }
    },
    // Once every asked call of the last answer has the user's yes or no, or the user answered its ask to connect a
    // service, the answer carries on by itself.
    sendAutomaticallyWhen: (options) =>
      lastAssistantMessageIsCompleteWithApprovalResponses(options) ||
      answeredAsk(options.messages),
    transport,
  });
  const busy = status === "submitted" || status === "streaming";
  // Stop lets go of the stream here and stops the model on the server (D6): what it wrote stays as the answer.
  const halt = () => {
    void stop();
    void fetch(`/api/chat/${id}/stop`, { method: "POST" });
  };
  const empty = messages.length === 0;

  // When an answer starts, the server has the chat: a new one gets its address without a reload, and the chat
  // goes to the top of the sidebar. A chat is named once, when it is made: its first line until the titles model
  // answers (onData above); later answers — a new question, regenerate, edit — only move it up.
  const fresh = useRef(initialMessages.length === 0);
  const touched = useRef(false);
  useEffect(() => {
    if (status !== "streaming") {
      touched.current = false;
      // The answer ended and no title came (no model, or it failed): the chat keeps its first line, naming is over.
      if (status === "ready" && naming.current) {
        naming.current = false;
        touch({ id, naming: false });
      }
      return;
    }
    if (touched.current) {
      return;
    }
    touched.current = true;
    if (!fresh.current) {
      touch({ id });
      return;
    }
    fresh.current = false;
    window.history.replaceState(null, "", `/chat/${id}`);
    const first = messages.find((m) => m.role === "user");
    const text =
      first?.parts
        .flatMap((p) => (p.type === "text" ? [p.text] : []))
        .join(" ") ?? "";
    touch({
      id,
      naming: naming.current && titled.current === null,
      title: titled.current ?? chatTitleFrom(text),
    });
  }, [status, messages, id, touch]);

  // The model a question went to: marks a switch for the answer that has not started yet.
  const [asked, setAsked] = useState<string>();
  // A mention is the `@Name` in the text: the server reads the thread's questions for the servers to use.
  const send = (text: string) => {
    clearError();
    setAsked(model.id);
    void sendMessage(
      { metadata: stamp(), text },
      { body: { modelId: model.id } }
    );
  };
  // An edited message replaces its old self and drops what followed; the server does the same with its copy.
  const edit = (messageId: string, text: string) => {
    clearError();
    setAsked(model.id);
    void sendMessage(
      { messageId, metadata: stamp(), text },
      { body: { modelId: model.id } }
    );
  };
  // An answer again, by the model in the chip, from the user's message before it.
  const regenerateFrom = (messageId: string) => {
    clearError();
    setAsked(model.id);
    void regenerate({
      body: { modelId: model.id },
      messageId,
    });
  };
  const retry = () => {
    clearError();
    setAsked(model.id);
    void regenerate({ body: { modelId: model.id } });
  };
  const labelOf = (modelId?: string) => {
    const picked = models.find((x) => x.id === modelId);
    return picked ? asLabel(picked) : labels.find((l) => l.id === modelId);
  };
  const rowOf = (row: ThreadRow) => {
    if (row.role === "switch") {
      return <ModelSwitch label={labelOf(row.modelId)} />;
    }
    if (row.role === "user") {
      return (
        <UserMessage
          mentions={servers}
          message={row.message}
          onEdit={busy ? undefined : (text) => edit(row.message.id, text)}
        />
      );
    }
    return (
      <AssistantMessage
        label={labelOf(row.message?.metadata?.modelId)}
        live={row.live}
        message={row.message}
        onApprove={(approvalId, approved) =>
          addToolApprovalResponse({ approved, id: approvalId })
        }
        onAsk={(toolCallId, connected) =>
          addToolOutput({
            output: { connected },
            tool: "request_connection",
            toolCallId,
          })
        }
        onRegenerate={busy ? undefined : regenerateFrom}
        onServerReady={serverReady}
        servers={servers}
      />
    );
  };

  return (
    <PickerDataProvider models={models} recent={recent}>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <style>{SCREEN_CSS}</style>
        {/*
          The thread (shadcn MessageScroller): a question that goes settles near the top with its answer growing
          under it, and once the answer runs past the view, the view follows the words — while the reader stays at
          the end; scrolling up to read stops that, the button brings the end back. A saved chat opens on its last
          question.
        */}
        <div className="relative min-h-0 flex-1">
          <MessageScrollerProvider
            autoScroll
            defaultScrollPosition="last-anchor"
          >
            <MessageScroller>
              <MessageScrollerViewport aria-label={t("thread")}>
                <MessageScrollerContent
                  className={cn(
                    "mx-auto w-full max-w-4xl px-4 text-sm md:px-6",
                    !empty && "py-6"
                  )}
                >
                  {threadRows(messages, status, asked)
                    .filter(
                      (row) => row.role !== "switch" || labelOf(row.modelId)
                    )
                    .map((row) => (
                      <MessageScrollerItem
                        key={row.key}
                        messageId={row.key}
                        scrollAnchor={row.role === "user"}
                      >
                        {rowOf(row)}
                      </MessageScrollerItem>
                    ))}
                  {error && !busy && (
                    <MessageScrollerItem messageId="error">
                      <ChatError error={error} onRetry={retry} />
                    </MessageScrollerItem>
                  )}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton>
                <ArrowDown />
                <span className="sr-only">{t("toLatest")}</span>
              </MessageScrollerButton>
            </MessageScroller>
          </MessageScrollerProvider>
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
          {/* An empty chat's composer is narrower; the thread's takes the column, the width easing out on the first send */}
          <div
            className={cn(
              "mx-auto transition-[max-width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
              empty ? "max-w-2xl" : "max-w-4xl"
            )}
          >
            <Composer
              busy={busy}
              favorites={favorites}
              model={model}
              onModel={setModel}
              onSend={send}
              onStop={halt}
              onServerReady={serverReady}
              servers={servers}
            />
          </div>
        </motion.div>
        {/* Below an empty chat's composer: its share of the free space and a bit more, so the pair sits above the middle */}
        {empty && <div className="flex-1 pb-[14vh]" />}
      </div>
    </PickerDataProvider>
  );
};
