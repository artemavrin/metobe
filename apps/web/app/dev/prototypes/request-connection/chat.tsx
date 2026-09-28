"use client";

import { Button } from "@metobe/ui/components/button";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowUp, ChevronDown, Plus } from "lucide-react";
import type { ReactNode } from "react";

import { AssistantMessage, UserMessage } from "@/components/chat/messages";

import { carriedOf, MODEL, pausedOf, questionOf } from "./data";
import type { Request } from "./state";

// The chat around the card, from the product's own messages: the question, the answer that stopped to ask, and —
// once the service is connected — the answer carrying on. The composer is a still copy of the real one.

/** The composer as the chat has it: one line, «+», the model, send. Here it only holds what a variant docks on it. */
const Composer = ({ dock, busy }: { dock?: ReactNode; busy: boolean }) => (
  <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky bottom-0 pt-2 pb-4 backdrop-blur">
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-2 px-4">
      {dock}
      <div className="bg-background flex items-center gap-1 rounded-3xl border p-1.5 shadow-xs">
        <Button aria-label="Добавить" className="rounded-full" size="icon" variant="ghost">
          <Plus />
        </Button>
        <input
          aria-label="Спросите что-нибудь…"
          className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent px-1 text-sm outline-none"
          placeholder="Спросите что-нибудь…"
        />
        <button className="text-muted-foreground hover:text-foreground flex h-8 items-center gap-1 rounded-full px-2.5 text-sm transition-colors duration-150" type="button">
          <span className="hidden sm:inline">{MODEL.title}</span>
          <span className="sm:hidden">Sonnet 5</span>
          <ChevronDown className="size-3.5 opacity-60" />
        </button>
        <Button aria-label={busy ? "Остановить" : "Отправить"} className="rounded-full" size="icon">
          {busy ? <span className="size-3 rounded-[3px] bg-current" /> : <ArrowUp />}
        </Button>
      </div>
    </div>
  </div>
);

/**
 * The thread: `inFeed` goes right under the paused answer, `dock` over the composer. The answer carries on under the
 * card once connected.
 */
export const ChatFrame = ({ request, inFeed, dock }: { request: Request; inFeed?: ReactNode; dock?: ReactNode }) => {
  const { scenario, phase, words, streaming } = request;
  const carried = phase === "connected" && words > 0;
  return (
    <div className="bg-background text-foreground flex min-h-dvh flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4 text-sm">
        <span className="truncate font-medium">{scenario.question}</span>
      </header>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 pt-8 pb-10">
        <UserMessage message={questionOf(scenario)} />
        <div className={cn("flex flex-col gap-3")}>
          {/* Paused, not writing: the reasoning folded, and no footer until the answer is done. */}
          <div className="[&_[data-slot=message-footer]]:hidden">
            <AssistantMessage label={MODEL} live={false} message={pausedOf(scenario)} />
          </div>
          {inFeed}
          {carried && <AssistantMessage label={MODEL} live={streaming} message={carriedOf(scenario, words)} />}
          {phase === "dismissed" && (
            <AssistantMessage
              label={MODEL}
              live={false}
              message={{
                id: "d",
                metadata: { createdAt: new Date().toISOString(), modelId: MODEL.id },
                parts: [
                  {
                    text: `Хорошо. Без доступа к ${scenario.server.title} ответить не получится — подключите его, когда будет удобно, и спросите снова.`,
                    type: "text",
                  },
                ],
                role: "assistant",
              }}
            />
          )}
        </div>
      </main>
      <Composer busy={phase !== "dismissed" && (phase !== "connected" || streaming)} dock={dock} />
    </div>
  );
};
