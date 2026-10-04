"use client";

import { FileText, Mail, MessageSquare } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useRef } from "react";
import type { ReactNode, RefObject } from "react";

import { BrandLogo } from "@/components/brand-logo";
import type { ComposerHandle } from "@/components/chat/composer";
import { GreetingFigure } from "@/components/chat/greeting-figure";
import { Welcome as ProductWelcome } from "@/components/chat/welcome";

import { ChatComposer, EASE_OUT, fillInto, mentionInto, pickFileIn, Screen, Thread, useData, useNewChat } from "./engine";
import type { NewChat } from "./engine";

// Round 2, after ReUI's ai-chat-3: the greeting with today under it, «Начать с» — rows that put something into the
// question (a server as its @mention, the mail as a question its tools answer, a file through the composer's own
// dialog), «Продолжить» — the last three chats, and the composer at the bottom from the start. The variants differ
// only in the Hairline picture: over the greeting, beside the column, left of the greeting, or none.

const ROW =
  "hover:bg-muted/70 flex h-11 w-full items-center gap-3 rounded-lg border px-3.5 text-left text-sm transition-[background-color,scale] duration-150 ease-out active:scale-[0.99]";

const Label = ({ children }: { children: ReactNode }) => <p className="text-muted-foreground mb-2 text-xs font-medium">{children}</p>;

const Hello = ({ left }: { left?: boolean }) => {
  const { greeting, today } = useData();
  return (
    <div className={left ? "text-left" : "text-center"}>
      <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{greeting}</h1>
      <p className="text-muted-foreground mt-2 first-letter:uppercase">{today}</p>
    </div>
  );
};

/** The user's usable servers (three at most here), their mail when they have a box, and a file. */
const Start = ({ chat, root }: { chat: NewChat; root: RefObject<HTMLDivElement | null> }) => {
  const t = useTranslations("chat.mcp");
  const { mailboxes } = useData();
  const servers = chat.servers.filter((s) => s.signIn !== "admin").slice(0, 3);
  return (
    <section>
      <Label>Начать с</Label>
      <div className="flex flex-col gap-2">
        {servers.map((s) => (
          <button className={ROW} key={s.id} onClick={() => mentionInto(root.current, s.title)} type="button">
            <BrandLogo label={s.title} logo={s.logo ?? undefined} size={20} />
            <span className="min-w-0 flex-1 truncate">{s.title}</span>
            {s.signIn === "self" && <span className="shrink-0 text-xs text-sky-700 dark:text-sky-300">{t("signIn")}</span>}
          </button>
        ))}
        {mailboxes.length > 0 && (
          <button className={ROW} onClick={() => fillInto(root.current, "Что непрочитанного в почте?")} type="button">
            <Mail className="text-muted-foreground size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">Непрочитанное в почте</span>
            <span className="text-muted-foreground max-w-[45%] truncate text-xs">{mailboxes.join(", ")}</span>
          </button>
        )}
        <button className={ROW} onClick={() => pickFileIn(root.current)} type="button">
          <FileText className="text-muted-foreground size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">Разобрать файл</span>
          <span className="text-muted-foreground shrink-0 text-xs">PDF, Word, Excel, картинки</span>
        </button>
      </div>
    </section>
  );
};

/** The last three chats; a row opens its chat. */
const Resume = () => {
  const { recentChats } = useData();
  const format = useFormatter();
  if (recentChats.length === 0) {
    return null;
  }
  const now = new Date();
  return (
    <section>
      <Label>Продолжить</Label>
      <ul className="flex flex-col">
        {recentChats.map((c) => (
          <li key={c.id}>
            <Link
              className="text-muted-foreground hover:text-foreground flex items-center gap-2 py-1 text-sm transition-colors duration-150"
              href={`/chat/${c.id}`}
            >
              <MessageSquare className="size-3.5 shrink-0" />
              <span className="truncate">{c.title || "Без названия"}</span>
              <span className="text-muted-foreground/70 shrink-0 text-xs">{format.relativeTime(new Date(c.updatedAt), now)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
};

const Welcome = ({ figure }: { figure: "top" | "side" | "left" | "none" }) => {
  const chat = useNewChat();
  const root = useRef<HTMLDivElement>(null);
  const column = (
    <>
      <Start chat={chat} root={root} />
      <Resume />
    </>
  );
  return (
    <Screen>
      <div className="relative flex min-h-0 flex-1 flex-col" ref={root}>
        {!chat.empty && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Thread chat={chat} />
          </div>
        )}
        <AnimatePresence initial={false} mode="popLayout">
          {chat.empty && (
            <motion.div
              className="chat-rise min-h-0 flex-1 overflow-y-auto"
              exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE_OUT } }}
              key="welcome"
            >
              <div className="flex min-h-full items-center justify-center px-4 py-8">
                {figure === "left" ? (
                  <div className="flex w-full max-w-xl flex-col gap-8">
                    {/* The picture's box keeps room for the icons' flight round the tray: the negative margins take it back */}
                    <div className="flex items-center">
                      <div className="shrink-0 [@media(max-height:600px)]:hidden">
                        <GreetingFigure className="-my-6 -ml-7 w-40 sm:w-52" />
                      </div>
                      <Hello left />
                    </div>
                    {column}
                  </div>
                ) : figure === "side" ? (
                  <div className="grid w-full max-w-4xl items-center gap-12 lg:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="flex w-full max-w-xl flex-col gap-8">
                      <Hello left />
                      {column}
                    </div>
                    <div className="hidden lg:block">
                      <GreetingFigure className="w-[min(24rem,30vw)]" />
                    </div>
                  </div>
                ) : (
                  <div className="flex w-full max-w-xl flex-col gap-8">
                    <div className="flex flex-col items-center">
                      {figure === "top" && (
                        <div className="[@media(max-height:760px)]:hidden">
                          <GreetingFigure className="-mb-2 w-56 sm:w-64" />
                        </div>
                      )}
                      <Hello />
                    </div>
                    {column}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="chat-rise chat-rise-next w-full px-4 pb-4 md:px-6">
          <div className="mx-auto max-w-4xl">
            <ChatComposer chat={chat} />
          </div>
        </div>
      </div>
    </Screen>
  );
};

/** «Сверху»: the picture over the greeting, the column as ai-chat-3 has it. */
export const Top = () => <Welcome figure="top" />;
/** «Сбоку»: the column to the left, the greeting with it; the picture to its right on a wide screen. */
export const Side = () => <Welcome figure="side" />;
/** «Слева»: the picture to the left of the greeting and today, the rest under the pair. */
export const Left = () => <Welcome figure="left" />;
/** «Без картинки»: ai-chat-3 on our data, for comparison. */
export const Plain = () => <Welcome figure="none" />;

/**
 * «Первый раз»: the product's own welcome (components/chat/welcome) for a user with no chat yet — the picture over
 * the greeting, no «Продолжить». The user has chats, so their list is left out here.
 */
export const First = () => {
  const data = useData();
  const chat = useNewChat();
  const composer = useRef<ComposerHandle>(null);
  return (
    <Screen>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1">
          {!chat.empty && (
            <div className="h-full overflow-y-auto">
              <Thread chat={chat} />
            </div>
          )}
          <AnimatePresence initial={false}>
            {chat.empty && (
              <motion.div
                className="chat-rise absolute inset-0 overflow-y-auto"
                exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE_OUT } }}
                key="welcome"
              >
                <ProductWelcome
                  composer={composer}
                  data={{ greeting: data.greeting, mailboxes: data.mailboxes, recent: [], today: data.today }}
                  servers={chat.servers}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="chat-rise chat-rise-next w-full px-4 pb-4 md:px-6">
          <div className="mx-auto max-w-4xl">
            <ChatComposer chat={chat} composerRef={composer} />
          </div>
        </div>
      </div>
    </Screen>
  );
};
