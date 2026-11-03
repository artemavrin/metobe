"use client";

import { Button } from "@metobe/ui/components/button";
import { ArrowUp, ChevronDown, Plus } from "lucide-react";
import type { ReactNode } from "react";

import { AssistantMessage, UserMessage } from "@/components/chat/messages";

import { askOf, carriedOf, MODEL, pausedOf } from "./data";
import type { Ask } from "./state";

// The chat around the question, from the product's own messages: the ask, the answer that stopped to ask, what the
// user said, and the answer carrying on. The composer is a still copy of the real one, unless a variant takes its
// place.

export const Composer = ({
  busy,
  placeholder = "Спросите что-нибудь…",
  onSend,
}: {
  busy: boolean;
  placeholder?: string;
  /** Where the typed line goes; without it the composer is still. */
  onSend?: (text: string) => void;
}) => (
  <form
    className="bg-background flex items-center gap-1 rounded-3xl border p-1.5 shadow-xs"
    onSubmit={(e) => {
      e.preventDefault();
      const text = String(new FormData(e.currentTarget).get("text") ?? "").trim();
      if (text) onSend?.(text);
    }}
  >
    <Button aria-label="Добавить" className="rounded-full" size="icon" type="button" variant="ghost">
      <Plus />
    </Button>
    <input
      aria-label={placeholder}
      className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent px-1 text-sm outline-none"
      name="text"
      placeholder={placeholder}
    />
    <button className="text-muted-foreground hover:text-foreground flex h-8 items-center gap-1 rounded-full px-2.5 text-sm transition-colors duration-150" type="button">
      <span className="hidden sm:inline">{MODEL.title}</span>
      <span className="sm:hidden">Sonnet 5</span>
      <ChevronDown className="size-3.5 opacity-60" />
    </button>
    <Button aria-label={busy ? "Остановить" : "Отправить"} className="rounded-full" size="icon" type="submit">
      {busy ? <span className="size-3 rounded-[3px] bg-current" /> : <ArrowUp />}
    </Button>
  </form>
);

/**
 * The thread: `inFeed` goes right under the paused answer, `reply` — what the user said, as a message of theirs —
 * after it, and `dock` takes the composer's place while the question is open.
 */
export const ChatFrame = ({
  ask,
  inFeed,
  reply,
  dock,
  lead,
}: {
  ask: Ask;
  inFeed?: ReactNode;
  reply?: string | ReactNode;
  dock?: ReactNode;
  /** What the paused answer says, if not the scenario's own line. */
  lead?: string;
}) => {
  const { scenario, phase, words, streaming, text } = ask;
  return (
    <div className="bg-background text-foreground flex min-h-dvh flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4 text-sm">
        <span className="truncate font-medium">{scenario.ask}</span>
      </header>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 pt-8 pb-10">
        <UserMessage message={askOf(scenario)} />
        <div className="flex flex-col gap-3">
          {/* Paused, not writing: no footer until the answer is done. */}
          <div className="[&_[data-slot=message-footer]]:hidden">
            <AssistantMessage label={MODEL} live={false} message={pausedOf(scenario, lead)} />
          </div>
          {inFeed}
        </div>
        {reply && typeof reply !== "string" && reply}
        {typeof reply === "string" && reply && (
          <UserMessage
            message={{ id: `r-${scenario.id}`, metadata: { createdAt: new Date().toISOString() }, parts: [{ text: reply, type: "text" }], role: "user" }}
          />
        )}
        {phase !== "asking" && words > 0 && <AssistantMessage label={MODEL} live={streaming} message={carriedOf(scenario, text, words)} />}
      </main>
      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky bottom-0 pt-2 pb-4 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-2 px-4">{dock ?? <Composer busy={streaming} />}</div>
      </div>
    </div>
  );
};
