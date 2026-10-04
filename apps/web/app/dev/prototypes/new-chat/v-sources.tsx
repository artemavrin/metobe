"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import { Mail } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useRef } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { GreetingFigure } from "@/components/chat/greeting-figure";

import { ChatComposer, EASE_OUT, mentionInto, Screen, SPRING, Thread, useData, useNewChat } from "./engine";
import type { NewChat } from "./engine";

// «Источники»: the picture says everything flows in here; the line under the composer says what does, for this user
// — their servers and their mail, as the chat has them. A server's chip puts its @mention into the question, the
// way the mention menu would; its hint is the menu's own (tools, or «Войти»).

const CHIP = "border-border/70 bg-background inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-sm";

const Sources = ({ chat, onMention }: { chat: NewChat; onMention: (title: string) => void }) => {
  const t = useTranslations("chat.mcp");
  const { mailboxes } = useData();
  if (chat.servers.length === 0 && mailboxes.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5 pt-4">
      <span className="text-muted-foreground mr-1 text-sm">Спросите про</span>
      {chat.servers.map((server) => {
        const blocked = server.signIn === "admin";
        let hint = t("tools", { count: server.toolCount });
        if (server.signIn === "self") {
          hint = t("signIn");
        } else if (blocked) {
          hint = t("adminOnly");
        }
        return (
          <Tooltip key={server.id}>
            <TooltipTrigger
              render={
                <button
                  className={cn(CHIP, "hover:bg-accent transition-[background-color,scale] duration-150 ease-out active:scale-[0.97]", blocked && "pointer-events-none opacity-50")}
                  disabled={blocked}
                  onClick={() => onMention(server.title)}
                  type="button"
                />
              }
            >
              <BrandLogo label={server.title} logo={server.logo ?? undefined} size={18} />
              <span className="max-w-40 truncate">{server.title}</span>
              {server.signIn === "self" && <span className="size-1.5 rounded-full bg-sky-500" />}
            </TooltipTrigger>
            <TooltipContent side="bottom">{hint}</TooltipContent>
          </Tooltip>
        );
      })}
      {mailboxes.length > 0 && (
        <Tooltip>
          <TooltipTrigger render={<span className={cn(CHIP, "text-muted-foreground cursor-default")} />}>
            <Mail className="size-4" />
            <span>Почта{mailboxes.length > 1 ? ` · ${mailboxes.length}` : ""}</span>
          </TooltipTrigger>
          <TooltipContent side="bottom">{mailboxes.join(", ")}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
};

export const SourcesVariant = () => {
  const { greeting } = useData();
  const chat = useNewChat();
  const root = useRef<HTMLDivElement>(null);
  return (
    <Screen>
      <div className="relative flex min-h-0 flex-1 flex-col" ref={root}>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Thread chat={chat} />
        </div>
        <AnimatePresence initial={false} mode="popLayout">
          {chat.empty && (
            <motion.div
              className="chat-rise flex w-full flex-col items-center px-6 pb-6"
              exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE_OUT } }}
              key="greeting"
            >
              <div className="[@media(max-height:540px)]:hidden">
                <GreetingFigure className="w-64 sm:w-80" />
              </div>
              <h1 className="text-center text-2xl font-semibold tracking-tight text-balance">{greeting}</h1>
            </motion.div>
          )}
        </AnimatePresence>
        <motion.div className={cn("chat-rise chat-rise-next w-full px-4 md:px-6", !chat.empty && "pb-4")} layout="position" transition={SPRING}>
          <div className={cn("mx-auto transition-[max-width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]", chat.empty ? "max-w-2xl" : "max-w-4xl")}>
            <ChatComposer chat={chat} />
          </div>
        </motion.div>
        <AnimatePresence initial={false}>
          {chat.empty && (
            <motion.div className="chat-rise chat-rise-next px-4" exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE_OUT } }} key="sources">
              <Sources chat={chat} onMention={(title) => mentionInto(root.current, title)} />
            </motion.div>
          )}
        </AnimatePresence>
        {chat.empty && <div className="flex-1 pb-[14vh]" />}
      </div>
    </Screen>
  );
};
