"use client";

import { cn } from "@metobe/ui/lib/utils";
import { AnimatePresence, motion } from "motion/react";

import { GreetingFigure } from "@/components/chat/greeting-figure";

import { ChatComposer, EASE_OUT, Screen, SPRING, Thread, useData, useNewChat } from "./engine";

// «Фон»: the picture is the screen's weather, not an object on it — large and faint behind the greeting, its edges
// gone in a fade, so the icons come out of the mist. The greeting and the composer stand on it at full contrast.

export const Ambient = () => {
  const { greeting } = useData();
  const chat = useNewChat();
  return (
    <Screen>
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <AnimatePresence initial={false}>
          {chat.empty && (
            <motion.div
              animate={{ opacity: 1 }}
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 bottom-[36%] flex items-center justify-center"
              exit={{ opacity: 0, transition: { duration: 0.2, ease: EASE_OUT } }}
              initial={{ opacity: 0 }}
              key="backdrop"
              transition={{ duration: 0.6, ease: EASE_OUT }}
            >
              {/* The figure answers the pointer where nothing stands over it */}
              <div className="pointer-events-auto opacity-45 [mask-image:radial-gradient(closest-side,black_55%,transparent)] dark:opacity-55">
                <GreetingFigure className="w-[min(58rem,96vw,118dvh)]" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className={cn("relative min-h-0 flex-1 overflow-y-auto", chat.empty && "pointer-events-none")}>
          <Thread chat={chat} />
        </div>
        <AnimatePresence initial={false} mode="popLayout">
          {chat.empty && (
            <motion.h1
              className="chat-rise relative w-full px-6 pb-6 text-center text-3xl font-semibold tracking-tight text-balance"
              exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE_OUT } }}
              key="greeting"
            >
              {greeting}
            </motion.h1>
          )}
        </AnimatePresence>
        <motion.div className={cn("chat-rise chat-rise-next relative w-full px-4 md:px-6", !chat.empty && "pb-4")} layout="position" transition={SPRING}>
          <div className={cn("mx-auto transition-[max-width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]", chat.empty ? "max-w-2xl" : "max-w-4xl")}>
            <ChatComposer chat={chat} />
          </div>
        </motion.div>
        {chat.empty && <div className="flex-1 pb-[14vh]" />}
      </div>
    </Screen>
  );
};
