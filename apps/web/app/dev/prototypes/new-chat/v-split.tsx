"use client";

import { cn } from "@metobe/ui/lib/utils";
import { AnimatePresence, motion } from "motion/react";

import { GreetingFigure } from "@/components/chat/greeting-figure";

import { ChatComposer, EASE_OUT, Screen, SPRING, Thread, useData, useNewChat } from "./engine";

// «Рядом»: on a wide screen the picture stands to the left and the greeting with the composer to its right, read
// left to right like a page; a narrow one stacks them. One grid holds both states, so the composer stays the same
// element (and keeps its focus) when the first question sends it to the bottom.

const SPLIT_CSS = `
.split { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; grid-template-areas: "thread" "composer"; }
.split[data-empty] { grid-template-rows: 1fr auto auto auto 1.4fr; grid-template-areas: "." "figure" "greeting" "composer" "."; }
@media (min-width: 1024px) {
  .split[data-empty] { grid-template-columns: 1fr auto minmax(0, 34rem) 1fr; grid-template-rows: 1fr auto auto 1.25fr; grid-template-areas: ". . . ." ". figure greeting ." ". figure composer ." ". . . ."; column-gap: 2.5rem; }
}
`;

export const Split = () => {
  const { greeting } = useData();
  const chat = useNewChat();
  return (
    <Screen>
      <style>{SPLIT_CSS}</style>
      <div className="split relative min-h-0 flex-1" data-empty={chat.empty ? "" : undefined}>
        {!chat.empty && (
          <div className="min-h-0 overflow-y-auto [grid-area:thread]">
            <Thread chat={chat} />
          </div>
        )}
        <AnimatePresence initial={false} mode="popLayout">
          {chat.empty && (
            <motion.div
              className="chat-rise flex justify-center self-center [grid-area:figure] [@media(max-height:540px)]:hidden"
              exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE_OUT } }}
              key="figure"
            >
              <GreetingFigure className="w-[min(18rem,72vw,40dvh)] lg:w-[min(28rem,32vw,62dvh)]" />
            </motion.div>
          )}
          {chat.empty && (
            <motion.div
              className="chat-rise flex flex-col gap-2 self-end px-6 pb-6 text-center [grid-area:greeting] lg:px-0 lg:text-left"
              exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE_OUT } }}
              key="greeting"
            >
              <h1 className="text-2xl font-semibold tracking-tight text-balance lg:text-4xl">{greeting}</h1>
            </motion.div>
          )}
        </AnimatePresence>
        <motion.div
          className={cn("chat-rise chat-rise-next w-full self-start px-4 [grid-area:composer] md:px-6", chat.empty ? "lg:px-0" : "pb-4")}
          layout="position"
          transition={SPRING}
        >
          <div className={cn("mx-auto transition-[max-width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]", chat.empty ? "max-w-2xl" : "max-w-4xl")}>
            <ChatComposer chat={chat} />
          </div>
        </motion.div>
      </div>
    </Screen>
  );
};
