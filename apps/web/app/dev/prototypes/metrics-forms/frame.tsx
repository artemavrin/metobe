"use client";

import { WidgetFrame } from "@/components/chat/widget-frame";
import { AssistantMessage, UserMessage } from "@/components/chat/messages";
import type { ChatMessage } from "@metobe/contracts/chat";
import type { ModelLabel } from "@metobe/core/chat";

import { METRICS_CSS } from "../metrics/atoms";

// The chat around a form: the question, the form in the strip's style, what the model says after it. Each form is
// drawn twice, A and B, under each other with a quiet label, so the two looks can be read side by side.

const MODEL: ModelLabel = { id: "00000000-0000-4000-8000-000000000001", providerLogo: null, providerTitle: "Anthropic", title: "Claude Sonnet 5" };
const at = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

export const Frame = ({ question, title, answer, children }: { question: string; title: string; answer: string; children: React.ReactNode }) => {
  const q: ChatMessage = { id: "q", metadata: { createdAt: at(1) }, parts: [{ text: question, type: "text" }], role: "user" };
  const a: ChatMessage = { id: "a", metadata: { createdAt: at(0), modelId: MODEL.id }, parts: [{ text: answer, type: "text" }], role: "assistant" };
  return (
    <div className="bg-background text-foreground flex min-h-dvh flex-col">
      <header className="flex h-12 shrink-0 items-center border-b px-4 text-sm">
        <span className="truncate font-medium">{question}</span>
      </header>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 pt-8 pb-28">
        <UserMessage message={q} />
        <div className="flex flex-col gap-4">
          <div className="@container m-root w-full" data-live="">
            <style>{METRICS_CSS}</style>
            <WidgetFrame building="" framed={false} streaming={false} title={title}>
              <div className="flex flex-col gap-8 px-1 pt-4 pb-1">{children}</div>
            </WidgetFrame>
          </div>
          <AssistantMessage label={MODEL} live={false} message={a} />
        </div>
      </main>
    </div>
  );
};

/** A look of a form: «А · Две колонки» over it, a hairline above. */
export const Look = ({ tag, name, note, children }: { tag: string; name: string; note?: string; children: React.ReactNode }) => (
  <section className="flex flex-col gap-3 border-t pt-4 first:border-t-0 first:pt-0">
    <h3 className="text-muted-foreground flex items-baseline gap-2 text-xs">
      <span className="bg-muted text-foreground rounded px-1.5 py-0.5 font-medium">{tag}</span>
      <span>{name}</span>
      {note && <span className="text-muted-foreground/70">· {note}</span>}
    </h3>
    {children}
  </section>
);
