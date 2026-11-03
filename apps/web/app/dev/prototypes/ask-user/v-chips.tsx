"use client";

import { Button } from "@metobe/ui/components/button";
import { cn } from "@metobe/ui/lib/utils";
import { Check } from "lucide-react";
import { useState } from "react";

import { ChatFrame, Composer } from "./chat";
import { type Answers, replyOf } from "./data";
import { ENTER } from "./parts";
import { useAsk } from "./state";

// «Кнопки»: the lightest — the model asks in its own words, the choices are buttons under the line, one tap answers.
// Several to pick: tap to mark, then «Готово». Any other answer is simply typed into the composer. Two questions go
// one after the other, as a person would ask them.

export const Chips = () => {
  const a = useAsk();
  const { questions } = a.scenario;
  const [step, setStep] = useState(0);
  const [said, setSaid] = useState<Answers>({});
  const [marked, setMarked] = useState<string[]>([]);
  const q = questions[step];

  const say = (words: string[]) => {
    if (!q) return;
    const next = { ...said, [q.name]: words };
    setSaid(next);
    setMarked([]);
    if (step + 1 < questions.length) setStep(step + 1);
    else a.answer(next);
  };

  const asking = a.phase === "asking" && q;
  let reply: string | undefined;
  if (a.phase === "answered") reply = replyOf(a.scenario, a.answers);
  else if (a.phase === "skipped") reply = "Решите сами";

  return (
    <ChatFrame
      ask={a}
      dock={
        asking ? (
          <Composer busy={false} onSend={(text) => say([text])} placeholder={q.other ?? "Или напишите свой ответ…"} />
        ) : undefined
      }
      inFeed={
        asking ? (
          <div className={cn("flex max-w-xl flex-col gap-2", ENTER)} key={q.name}>
            {step > 0 && <p className="text-muted-foreground text-sm">{replyOf(a.scenario, said)}</p>}
            <p className="font-medium">
              {q.prompt}
              {q.multiple && <span className="text-muted-foreground font-normal"> Можно несколько.</span>}
            </p>
            <div className="flex flex-wrap gap-2">
              {q.choices.map((c) => {
                const on = marked.includes(c.label);
                return (
                  <Button
                    aria-pressed={q.multiple ? on : undefined}
                    className={cn("h-auto min-h-9 rounded-full px-3.5 py-1.5", on && "border-primary/40 bg-muted")}
                    key={c.value}
                    onClick={() => (q.multiple ? setMarked(on ? marked.filter((x) => x !== c.label) : [...marked, c.label]) : say([c.label]))}
                    title={c.description}
                    type="button"
                    variant="outline"
                  >
                    {q.multiple && on && <Check />}
                    {c.label}
                    {c.description && <span className="text-muted-foreground font-normal">· {c.description}</span>}
                  </Button>
                );
              })}
              {q.multiple && (
                <Button className="h-auto min-h-9 rounded-full px-3.5" disabled={marked.length === 0} onClick={() => say(marked)} type="button">
                  Готово
                </Button>
              )}
              {q.optional && (
                <Button className="text-muted-foreground h-auto min-h-9 rounded-full" onClick={() => say([])} type="button" variant="ghost">
                  Пропустить
                </Button>
              )}
              <Button className="text-muted-foreground h-auto min-h-9 rounded-full" onClick={a.skip} type="button" variant="ghost">
                Решите сами
              </Button>
            </div>
          </div>
        ) : undefined
      }
      reply={reply}
    />
  );
};
