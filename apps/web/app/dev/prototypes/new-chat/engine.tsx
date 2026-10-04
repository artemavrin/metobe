"use client";

import type { ChatMessage } from "@metobe/contracts/chat";
import type { ChatServer } from "@metobe/core/mcp";
import type { FileUIPart } from "ai";
import { motion } from "motion/react";
import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode, Ref } from "react";

import { useAttachments } from "@/components/chat/attachments";
import { Composer } from "@/components/chat/composer";
import type { ComposerHandle } from "@/components/chat/composer";
import { AssistantMessage, UserMessage } from "@/components/chat/messages";
import { PickerDataProvider } from "@/components/chat/picker/data";
import type { Favorites, PickerModel } from "@/components/chat/picker/data";

// What every variant shares: the user's data, one new chat that a question turns into a thread (nothing is sent —
// the answer starts and stays starting), and the real composer wired the way the chat screen wires it.

export interface Data {
  greeting: string;
  model: PickerModel;
  models: PickerModel[];
  favorites: string[];
  recent: string[];
  servers: ChatServer[];
  /** The user's mailboxes: the chat gives the model their mail tools whenever there is one. */
  mailboxes: string[];
  /** The last three chats by their last message. */
  recentChats: { id: string; title: string; updatedAt: string }[];
  /** Today in the user's time zone, as a weekday and a date. */
  today: string;
}

const DataContext = createContext<Data | null>(null);
export const DataProvider = DataContext;

export const useData = () => {
  const data = useContext(DataContext);
  if (!data) {
    throw new Error("useData outside the prototype");
  }
  return data;
};

export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
/** The composer's move to the bottom, as the chat screen has it. */
export const SPRING = { bounce: 0.1, duration: 0.5, type: "spring" } as const;

/** The chat screen's entrance: the greeting rises in, the composer 60ms after it. */
export const SCREEN_CSS = `
@keyframes chat-rise { from { opacity: 0; translate: 0 8px; } }
@keyframes chat-rise-fade { from { opacity: 0; } }
.chat-rise { animation: chat-rise 300ms cubic-bezier(0.23, 1, 0.32, 1) backwards; }
.chat-rise-next { animation-delay: 60ms; }
@media (prefers-reduced-motion: reduce) { .chat-rise { animation-name: chat-rise-fade; } }
`;

/** Favorites that change on screen only: the prototype never writes the user's list. */
const useLocalFavorites = (initial: string[]): Favorites => {
  const [ids, setIds] = useState(initial);
  return useMemo(
    () => ({
      has: (id: string) => ids.includes(id),
      ids,
      removeMany: (drop: string[]) => setIds(ids.filter((id) => !drop.includes(id))),
      reorder: setIds,
      toggle: (id: string) => setIds(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]),
    }),
    [ids]
  );
};

/** One new chat: empty until a question goes, then the question and its answer starting. */
export const useNewChat = () => {
  const data = useData();
  const [model, setModel] = useState(data.model);
  const [servers, setServers] = useState(data.servers);
  const favorites = useLocalFavorites(data.favorites);
  const attachments = useAttachments();
  const [question, setQuestion] = useState<ChatMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const send = (text: string, files: FileUIPart[]) => {
    setQuestion({
      id: "q",
      metadata: { createdAt: new Date().toISOString() },
      parts: [...files, ...(text ? [{ text, type: "text" as const }] : [])],
      role: "user",
    });
    setBusy(true);
  };
  return {
    attachments,
    busy,
    empty: question === null,
    favorites,
    model,
    question,
    send,
    serverReady: (id: string) => setServers((list) => list.map((s) => (s.id === id ? { ...s, signIn: "ready" as const } : s))),
    servers,
    setModel,
    stop: () => setBusy(false),
  };
};
export type NewChat = ReturnType<typeof useNewChat>;

/** The screen's providers and its entrance css. */
export const Screen = ({ children }: { children: ReactNode }) => {
  const { models, recent } = useData();
  return (
    <PickerDataProvider models={models} recent={recent}>
      <style>{SCREEN_CSS}</style>
      {children}
    </PickerDataProvider>
  );
};

/** The real composer. */
export const ChatComposer = ({ chat, composerRef }: { chat: NewChat; composerRef?: Ref<ComposerHandle> }) => (
  <Composer
    ref={composerRef}
    attachments={chat.attachments}
    busy={chat.busy}
    favorites={chat.favorites}
    model={chat.model}
    onModel={chat.setModel}
    onSend={chat.send}
    onStop={chat.stop}
    onServerReady={chat.serverReady}
    servers={chat.servers}
  />
);

/** The thread once a question went: it rises in, and the answer under it is starting. */
export const Thread = ({ chat }: { chat: NewChat }) => {
  if (!chat.question) {
    return null;
  }
  const label = { id: chat.model.id, providerLogo: chat.model.logo ?? null, providerTitle: chat.model.makerTitle, title: chat.model.title };
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 text-sm md:px-6">
      <motion.div animate={{ opacity: 1, y: 0 }} initial={{ opacity: 0, y: 8 }} transition={{ delay: 0.12, duration: 0.3, ease: EASE_OUT }}>
        <UserMessage mentions={chat.servers} message={chat.question} />
      </motion.div>
      {chat.busy && <AssistantMessage label={label} live />}
    </div>
  );
};

/**
 * Puts `@Name` of a server into the composer and takes the mention menu's first match, the way typing it would:
 * the prototype has no handle on the composer, so it types into its editor.
 */
export const mentionInto = (root: HTMLElement | null, title: string) => {
  const editor = root?.querySelector<HTMLElement>('[contenteditable="true"]');
  if (!editor) {
    return;
  }
  editor.focus();
  const sel = window.getSelection();
  sel?.selectAllChildren(editor);
  sel?.collapseToEnd();
  const before = editor.textContent ?? "";
  const query = title.split(/\s+/u)[0] ?? title;
  document.execCommand("insertText", false, `${before && !/\s$/u.test(before) ? " " : ""}@${query}`);
  requestAnimationFrame(() =>
    editor.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" }))
  );
};

/** Replaces the composer's draft with a question, caret at its end — as a starter row of ai-chat-3 does. */
export const fillInto = (root: HTMLElement | null, text: string) => {
  const editor = root?.querySelector<HTMLElement>('[contenteditable="true"]');
  if (!editor) {
    return;
  }
  editor.focus();
  window.getSelection()?.selectAllChildren(editor);
  document.execCommand("insertText", false, text);
};

/** Opens the composer's own file dialog. */
export const pickFileIn = (root: HTMLElement | null) => root?.querySelector<HTMLInputElement>('input[type="file"]')?.click();
