"use client";

import { AnimatePresence, motion } from "motion/react";

import { GreetingFigure } from "@/components/chat/greeting-figure";

import { ChatComposer, EASE_OUT, Screen, Thread, useData, useNewChat } from "./engine";

// «Внизу»: the composer stands where a chat keeps it from the start — at the bottom, as wide as the thread. The
// picture and the greeting fill the free space above it; the first question only clears them, nothing travels.

export const Anchored = () => {
  const { greeting } = useData();
  const chat = useNewChat();
  return (
    <Screen>
      <div className="relative flex min-h-0 flex-1 flex-col">
        {!chat.empty && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Thread chat={chat} />
          </div>
        )}
        <AnimatePresence initial={false} mode="popLayout">
          {chat.empty && (
            <motion.div
              className="chat-rise flex min-h-0 flex-1 flex-col items-center justify-center px-6 pb-6"
              exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE_OUT } }}
              key="greeting"
            >
              <div className="[@media(max-height:540px)]:hidden">
                <GreetingFigure className="w-[min(24rem,80vw,46dvh)]" />
              </div>
              <h1 className="text-center text-2xl font-semibold tracking-tight text-balance">{greeting}</h1>
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
