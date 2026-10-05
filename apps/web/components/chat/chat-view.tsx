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
  useMessageScroller,
} from "@metobe/ui/components/message-scroller";
import { cn } from "@metobe/ui/lib/utils";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai";
import type { FileUIPart } from "ai";
import { ArrowDown, Paperclip, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { FileSinkContext, useAttachments } from "@/components/chat/attachments";
import { useTouchChat } from "@/components/chat/chat-shell";
import { Composer } from "@/components/chat/composer";
import type { ComposerHandle } from "@/components/chat/composer";
import {
  AssistantMessage,
  ModelSwitch,
  UserMessage,
} from "@/components/chat/messages";
import { PickerDataProvider } from "@/components/chat/picker/data";
import type { PickerModel } from "@/components/chat/picker/data";
import { useFavorites } from "@/components/chat/picker/use-favorites";
import { ServerClockProvider } from "@/components/chat/server-clock";
import { Welcome } from "@/components/chat/welcome";
import type { WelcomeData } from "@/components/chat/welcome";
import { chatProblem, retryAtOf } from "@/lib/chat-errors";
import { answeredAsk, connectionsOf } from "@/lib/connection-asks";
import { threadRows } from "@/lib/thread-rows";
import type { ThreadRow } from "@/lib/thread-rows";
import { uuid } from "@/lib/uuid";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

// The screen's own entrance: a new chat opens with its welcome rising in, the composer 60ms after it. A CSS
// animation (off the main thread, smooth while the page hydrates) on `translate`; `backwards` keeps both hidden
// through the delay and leaves nothing behind.
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

/**
 * A chat opened on a question still being answered (a reload mid-answer): the scroller would put the end of the thread
 * in view, and the question would sit against the composer with the answer written under the edge. It settles at the
 * top instead, where a question just sent settles.
 */
const SeatQuestion = ({ rowKey }: { rowKey?: string }) => {
  const { scrollToMessage } = useMessageScroller();
  // Once, on opening: later questions are seated by the scroller itself.
  const seated = useRef(false);
  useLayoutEffect(() => {
    if (rowKey && !seated.current) {
      seated.current = true;
      scrollToMessage(rowKey, { align: "start" });
    }
  }, [rowKey, scrollToMessage]);
  return null;
};

/**
 * A row of the thread. While an answer is written only its own row changes; the others (their markdown, their ribbon
 * of steps) are not drawn again on every word — in a long chat that is what made the page heavy. A row is drawn again
 * when its message, its being live or the thread's state (`sig`: busy or not, how many messages, the models' names)
 * changes; the closures it draws with are the latest ones at that moment.
 */
const same = (a: ThreadRow, b: ThreadRow) =>
  a.key === b.key &&
  a.role === b.role &&
  ("message" in a ? a.message : undefined) ===
    ("message" in b ? b.message : undefined) &&
  ("live" in a ? a.live : false) === ("live" in b ? b.live : false);

const RowView = ({
  row,
  render,
}: {
  row: ThreadRow;
  render: (row: ThreadRow) => ReactNode;
  sig: string;
}) => render(row);
const ThreadRowView = memo(
  RowView,
  (a, b) => same(a.row, b.row) && a.sig === b.sig
);

/** The key of the thread's last question. */
const lastQuestionKey = (rows: { key: string; role: string }[]) => {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i]?.role === "user") {
      return rows[i]?.key;
    }
  }
};

/**
 * Files dragged over the window: the whole chat lights up as the place to drop them; dropped, they join the composer.
 * Counted by enter/leave so moving over children does not flicker it.
 */
const useFileDrop = (onFiles: (files: File[]) => void) => {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) =>
      e.dataTransfer?.types.includes("Files") ?? false;
    const enter = (e: DragEvent) => {
      if (hasFiles(e)) {
        depth += 1;
        setDragging(true);
      }
    };
    const leave = (e: DragEvent) => {
      if (hasFiles(e)) {
        depth = Math.max(0, depth - 1);
        if (depth === 0) {
          setDragging(false);
        }
      }
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) {
        e.preventDefault();
      }
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) {
        return;
      }
      e.preventDefault();
      depth = 0;
      setDragging(false);
      onFiles([...(e.dataTransfer?.files ?? [])]);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [onFiles]);
  return dragging;
};

/** The drop target over the chat: fades in (150 ms), its words rise from 0.96 (180 ms); reduced motion — the fade. */
const DropZone = ({ shown }: { shown: boolean }) => {
  const t = useTranslations("chat.files");
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          animate={{ opacity: 1 }}
          className="bg-background/80 border-foreground/25 pointer-events-none absolute inset-2 z-40 grid place-items-center rounded-2xl border-2 border-dashed backdrop-blur-[2px]"
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
          initial={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: EASE_OUT }}
        >
          <motion.div
            animate={{ opacity: 1, transform: "scale(1)" }}
            className="flex flex-col items-center gap-2 text-center"
            initial={{
              opacity: 0,
              transform: reduce ? "scale(1)" : "scale(0.96)",
            }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
          >
            <Paperclip className="text-muted-foreground size-6" />
            <span className="text-sm font-medium">{t("drop")}</span>
            <span className="text-muted-foreground text-xs">
              {t("dropHint")}
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const ChatError = ({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) => {
  const t = useTranslations("chat");
  const format = useFormatter();
  const problem = chatProblem(error);
  // A limit says when the next message may go — today or tomorrow, at the person's own time.
  const at = retryAtOf(error) ?? new Date();
  const dayOf = (date: Date) => format.dateTime(date, { dateStyle: "short" });
  const when = {
    day: dayOf(at) === dayOf(new Date()) ? "today" : "other",
    time: format.dateTime(at, { timeStyle: "short" }),
  };
  return (
    <div className="flex items-center gap-3" role="alert">
      <TriangleAlert className="text-destructive size-[22px] shrink-0 p-0.5" />
      <span className="text-muted-foreground min-w-0 flex-1">
        {t(`errors.${problem}`, when)}
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
 * A chat: the thread and the composer in one tree. A new chat has its welcome over the empty thread and the
 * composer already at the bottom, where the thread keeps it: the first message fades the welcome out, the question
 * rises in, and the composer keeps its place and its focus.
 */
export const ChatView = ({
  id: givenId,
  initialMessages,
  model: initialModel,
  models,
  favorites: initialFavorites,
  recent,
  labels,
  welcome,
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
  welcome?: WelcomeData;
}) => {
  const t = useTranslations("chat");
  // oxlint-disable-next-line react/hook-use-state -- made once and never changed: no setter to name
  const [id] = useState(() => givenId ?? uuid());
  // The welcome's rows put a server, words or files into the draft.
  const composer = useRef<ComposerHandle>(null);
  const touch = useTouchChat();
  // oxlint-disable-next-line react/hook-use-state -- decided once and never changed: no setter to name
  const [resume] = useState(() => initialMessages.at(-1)?.role === "user");
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
  // How far this browser's clock is ahead of the server's: the ribbon counts a running step by the server's clock.
  const [clockOffset, setClockOffset] = useState(0);
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
    generateId: uuid,
    id,
    messages: initialMessages,
    // A new chat's name from the titles model: the sidebar shows it as soon as it comes.
    onData: (part) => {
      if (part.type === "data-naming") {
        naming.current = true;
        touch({ id, naming: true });
      } else if (part.type === "data-clock") {
        setClockOffset(Date.now() - part.data);
      } else if (part.type === "data-title") {
        titled.current = part.data;
        naming.current = false;
        touch({ id, naming: false, title: part.data });
      }
    },
    // The thread ends with the user's own message: its answer may still be being written (the page was reloaded in
    // the middle of it) — join it. Decided once, on opening the chat: a later refresh of the page's data must not
    // start a second reading of an answer this page is already reading.
    resume,
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
  const attachments = useAttachments();
  // A file dropped on the screen joins the message being edited, when one is open; else the composer.
  const toEdit = useRef<((files: File[]) => void) | null>(null);
  const { add: addToComposer } = attachments;
  const sink = useMemo(
    () => ({
      set: (take: ((files: File[]) => void) | null) => {
        toEdit.current = take;
      },
    }),
    []
  );
  const dropFiles = useCallback(
    (files: File[]) => (toEdit.current ?? addToComposer)(files),
    [addToComposer]
  );
  const dragging = useFileDrop(dropFiles);
  // A mention is the `@Name` in the text: the server reads the thread's questions for the servers to use.
  const send = (text: string, files: FileUIPart[] = []) => {
    clearError();
    setAsked(model.id);
    void sendMessage(
      text ? { files, metadata: stamp(), text } : { files, metadata: stamp() },
      { body: { modelId: model.id } }
    );
  };
  // An edited message replaces its old self and drops what followed; the server does the same with its copy. Its
  // files are the ones the edit left on it, old and new.
  const edit = (messageId: string, text: string, files: FileUIPart[]) => {
    clearError();
    setAsked(model.id);
    void sendMessage(
      { files, messageId, metadata: stamp(), text },
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
          onEdit={
            busy
              ? undefined
              : (text, files) => edit(row.message.id, text, files)
          }
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

  const sig = `${busy}:${messages.length}:${servers.length}:${models.length}`;
  const rows = threadRows(messages, status, asked).filter(
    (row) => row.role !== "switch" || labelOf(row.modelId)
  );

  return (
    <PickerDataProvider models={models} recent={recent}>
      <FileSinkContext value={sink}>
        <div className="relative flex min-h-0 flex-1 flex-col">
          <style>{SCREEN_CSS}</style>
          <DropZone shown={dragging} />
          {/*
          The thread (shadcn MessageScroller): a question that goes settles near the top with its answer growing
          under it, and once the answer runs past the view, the view follows the words — while the reader stays at
          the end; scrolling up to read stops that, the button brings the end back. A saved chat opens on its last
          question.
        */}
          <div className="relative min-h-0 flex-1">
            <ServerClockProvider value={clockOffset}>
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
                      {rows.map((row) => (
                        <MessageScrollerItem
                          key={row.key}
                          messageId={row.key}
                          scrollAnchor={row.role === "user"}
                        >
                          <ThreadRowView render={rowOf} row={row} sig={sig} />
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
                <SeatQuestion
                  rowKey={resume ? lastQuestionKey(rows) : undefined}
                />
              </MessageScrollerProvider>
            </ServerClockProvider>
            {/* A new chat's screen over the empty thread: the first question fades it out and rises in under it */}
            <AnimatePresence initial={false}>
              {empty && welcome && (
                <motion.div
                  className="chat-rise absolute inset-0 overflow-y-auto"
                  exit={{
                    opacity: 0,
                    transition: { duration: 0.15, ease: EASE_OUT },
                  }}
                  key="welcome"
                >
                  <Welcome
                    composer={composer}
                    data={welcome}
                    servers={servers}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {/* The composer stands where the thread keeps it from the start: the first question moves nothing */}
          <div className="chat-rise chat-rise-next w-full px-4 pb-4 md:px-6">
            <div className="mx-auto max-w-4xl">
              <Composer
                busy={busy}
                favorites={favorites}
                model={model}
                onModel={setModel}
                onSend={send}
                onStop={halt}
                attachments={attachments}
                onServerReady={serverReady}
                ref={composer}
                servers={servers}
              />
            </div>
          </div>
        </div>
      </FileSinkContext>
    </PickerDataProvider>
  );
};
