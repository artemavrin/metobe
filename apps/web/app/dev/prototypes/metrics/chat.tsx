"use client";

import { cn } from "@metobe/ui/lib/utils";

import { AssistantMessage, UserMessage } from "@/components/chat/messages";
import { WidgetFailure } from "@/components/chat/widget-frame";
import type { ChatMessage } from "@metobe/contracts/chat";
import type { ModelLabel } from "@metobe/core/chat";

import type { Scenario } from "./data";
import { useProto } from "./state";

// The chat around the widget, from the product's own messages: the question, the widget in the answer, what the model
// says after it. The widget is the only part that differs between the variants.

const MODEL: ModelLabel = { id: "00000000-0000-4000-8000-000000000001", providerLogo: null, providerTitle: "Anthropic", title: "Claude Sonnet 5" };
const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

const question = (s: Scenario): ChatMessage => ({ id: `q-${s.id}`, metadata: { createdAt: at(1) }, parts: [{ text: s.question, type: "text" }], role: "user" });
const answer = (s: Scenario): ChatMessage => ({
  id: `a-${s.id}`,
  metadata: { createdAt: at(0), modelId: MODEL.id },
  parts: [{ text: s.answer, type: "text" }],
  role: "assistant",
});

export const ChatFrame = ({ scenario, widget }: { scenario: Scenario; widget: React.ReactNode }) => {
  const { status, screen } = useProto();
  return (
    <div className="bg-muted/40 min-h-dvh">
      <div className={cn("bg-background text-foreground mx-auto flex min-h-dvh flex-col", screen === "phone" ? "w-[390px] border-x" : "w-full")}>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4 text-sm">
          <span className="truncate font-medium">{scenario.question}</span>
        </header>
        <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 pt-8 pb-28">
          <UserMessage message={question(scenario)} />
          <div className="flex flex-col gap-4">
            {widget}
            {status === "ready" && <AssistantMessage label={MODEL} live={false} message={answer(scenario)} />}
          </div>
        </main>
      </div>
    </div>
  );
};

/** What every variant shows when the server could not build the numbers. */
export const Failure = () => (
  <WidgetFailure
    reason="from.field: there is no column «Сумма» in the result. Columns: Номер, Дата, Клиент, Выручка, Себестоимость."
    title="Не удалось посчитать показатели"
  />
);
