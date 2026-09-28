"use client";

import { cn } from "@metobe/ui/lib/utils";

import { OAuthDialog } from "../my-connections/oauth-flow";
import { ChatFrame } from "./chat";
import { Connected, Dismissed, ENTER, Head, SignIn } from "./parts";
import { useRequest } from "./state";

// «В ленте»: the card is part of the answer — who, why and the fields in one place, where the eye already is. The
// card folds to a line once connected, and the answer carries on under it.

export const Inline = () => {
  const r = useRequest();
  let card;
  if (r.phase === "connected") card = <Connected r={r} />;
  else if (r.phase === "dismissed") card = <Dismissed r={r} />;
  else
    card = (
      <div className={cn("bg-card flex max-w-xl flex-col gap-4 rounded-xl border p-4", r.phase === "error" && "border-destructive/40", ENTER)}>
        <Head r={r} />
        <SignIn layout="inline" onDismiss={r.dismiss} r={r} />
      </div>
    );
  return (
    <>
      <ChatFrame inFeed={card} request={r} />
      <OAuthDialog flow={r.oauth} />
    </>
  );
};
