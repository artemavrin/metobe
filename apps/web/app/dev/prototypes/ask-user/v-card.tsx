"use client";

import { ChatFrame } from "./chat";
import { AskForm, ENTER, Folded } from "./parts";
import { useAsk } from "./state";

// «Карточка»: the question is part of the answer — a card under the model's line, where the eye already is. Once
// answered it folds to «вопрос — ответ» lines, and the answer carries on under it.

export const Card = () => {
  const a = useAsk();
  return (
    <ChatFrame
      ask={a}
      inFeed={
        a.phase === "asking" ? (
          <div className={`bg-card max-w-xl rounded-xl border p-4 ${ENTER}`}>
            <AskForm a={a} />
          </div>
        ) : (
          <Folded a={a} className={ENTER} />
        )
      }
    />
  );
};
