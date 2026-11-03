"use client";

import { cn } from "@metobe/ui/lib/utils";
import type { ReactNode } from "react";
import { Streamdown } from "streamdown";

import { AssistantMessage, UserMessage } from "@/components/chat/messages";

import { Composer } from "../ask-user/chat";
import { AFTER, HISTORY, MODEL, SUMMARY } from "./data";
import { useProto } from "./state";

// The chat around the compaction, from the product's own messages: the long history, where the variant puts its
// summary (`fold` wraps the history itself), what is asked after it, and the composer with the variant's hint over
// it (`above`) or in its foot line (`foot`).

export const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";
/** In, as a thing that came: 4 px up and a fade; reduced motion — the fade. */
export const ENTER = `animate-in fade-in slide-in-from-bottom-1 duration-200 ${EASE} motion-reduce:slide-in-from-bottom-0`;

const Message = ({ m }: { m: (typeof HISTORY)[number] }) =>
  m.role === "user" ? (
    <UserMessage message={m} />
  ) : (
    <div className="[&_[data-slot=message-footer]]:hidden">
      <AssistantMessage label={MODEL} live={false} message={m} />
    </div>
  );

/** The summary as markdown, the way the thread's answers are written. */
export const Summary = ({ className }: { className?: string }) => (
  <div className={cn("text-sm leading-relaxed [&_li]:my-0.5 [&_p]:my-2 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5", className)}>
    <Streamdown>{SUMMARY}</Streamdown>
  </div>
);

export const ChatFrame = ({
  inThread,
  fold,
  above,
  foot,
}: {
  /** After the history: the variant's summary or card. */
  inThread?: ReactNode;
  /** Wraps the history itself (the fold variant). */
  fold?: (history: ReactNode) => ReactNode;
  above?: ReactNode;
  foot?: ReactNode;
}) => {
  const { phase, after } = useProto();
  const history = (
    <div className="flex flex-col gap-6">
      {HISTORY.map((m) => (
        <Message key={m.id} m={m} />
      ))}
    </div>
  );
  return (
    <div className="bg-background text-foreground flex min-h-dvh flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4 text-sm">
        <span className="truncate font-medium">План весенней рассылки</span>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 pt-8 pb-10">
        {fold ? fold(history) : history}
        {inThread}
        {phase === "compacted" && after && (
          <div className={cn("flex flex-col gap-6", ENTER)}>
            {AFTER.map((m) => (
              <Message key={m.id} m={m} />
            ))}
          </div>
        )}
      </main>
      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky bottom-0 pt-2 pb-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-4">
          {above}
          <Composer busy={phase === "compacting"} />
          <div className="text-muted-foreground flex min-h-5 items-center justify-center gap-1.5 text-xs">
            {foot ?? <span>Metobe может ошибаться — проверяйте важное</span>}
          </div>
        </div>
      </div>
    </div>
  );
};
