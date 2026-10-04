"use client";

import { cn } from "@metobe/ui/lib/utils";
import { AnimatePresence, motion } from "motion/react";

import { GreetingFigure } from "@/components/chat/greeting-figure";

import { ChatComposer, EASE_OUT, Screen, SPRING, Thread, useData, useNewChat } from "./engine";

// «Сцена»: the picture is the screen's subject — as large as the height allows, the greeting its caption under it,
// the composer below. A welcome poster; the first question clears it and the composer goes down, as now.

export const Stage = () => {
  const { greeting } = useData();
  const chat = useNewChat();
  return (
    <Screen>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Thread chat={chat} />
        </div>
        <AnimatePresence initial={false} mode="popLayout">
          {chat.empty && (
            <motion.div
              className="chat-rise flex w-full flex-col items-center px-6 pb-7"
              exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE_OUT } }}
              key="greeting"
            >
              <div className="[@media(max-height:540px)]:hidden">
                <GreetingFigure className="w-[min(38rem,90vw,66dvh)]" />
              </div>
              <h1 className="-mt-6 text-center text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{greeting}</h1>
            </motion.div>
          )}
        </AnimatePresence>
        <motion.div className={cn("chat-rise chat-rise-next w-full px-4 md:px-6", !chat.empty && "pb-4")} layout="position" transition={SPRING}>
          <div className={cn("mx-auto transition-[max-width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]", chat.empty ? "max-w-2xl" : "max-w-4xl")}>
            <ChatComposer chat={chat} />
          </div>
        </motion.div>
        {chat.empty && <div className="flex-1 pb-[6vh]" />}
      </div>
    </Screen>
  );
};
