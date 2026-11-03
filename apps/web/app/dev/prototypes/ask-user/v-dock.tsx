"use client";

import { ChatFrame } from "./chat";
import { replyOf } from "./data";
import { AskForm, ENTER } from "./parts";
import { useAsk } from "./state";

// «Вместо поля ввода»: while the model waits, the only thing to do is to answer — so the question takes the
// composer's place, under the thumb on a phone. What the user picked goes into the thread as their own message, and
// the composer comes back.

export const Dock = () => {
  const a = useAsk();
  let reply: string | undefined;
  if (a.phase === "answered") reply = replyOf(a.scenario, a.answers);
  else if (a.phase === "skipped") reply = "Решите сами";
  return (
    <ChatFrame
      ask={a}
      dock={
        a.phase === "asking" ? (
          <div className={`bg-background rounded-3xl border p-4 shadow-sm ${ENTER}`}>
            <AskForm a={a} />
          </div>
        ) : undefined
      }
      reply={reply}
    />
  );
};
