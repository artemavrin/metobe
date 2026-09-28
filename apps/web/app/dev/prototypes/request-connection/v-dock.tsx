"use client";

import { Button } from "@metobe/ui/components/button";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowDown, X } from "lucide-react";

import { Mark } from "../my-connections/parts";
import { OAuthDialog } from "../my-connections/oauth-flow";
import { ChatFrame } from "./chat";
import { Connected, Dismissed, ENTER, Head, SignIn } from "./parts";
import { useRequest } from "./state";

// «У композера»: the ask sits over the input, where the hands already are — the thread only marks that the answer is
// waiting. Typing a key is what the user does next, so the fields come where they type; the thread stays as it is.

export const Dock = () => {
  const r = useRequest();
  const waiting = r.phase !== "connected" && r.phase !== "dismissed";
  let mark;
  if (r.phase === "connected") mark = <Connected r={r} />;
  else if (r.phase === "dismissed") mark = <Dismissed r={r} />;
  else
    mark = (
      <p className={cn("text-muted-foreground flex items-center gap-2 text-sm", ENTER)}>
        <Mark server={r.scenario.server} size={18} />
        Ответ ждёт подключения {r.scenario.server.title}
        <ArrowDown className="size-3.5" />
      </p>
    );
  const dock = waiting && (
    <div
      className={cn(
        "bg-card relative flex flex-col gap-3 rounded-2xl border p-3 shadow-sm sm:p-4",
        r.phase === "error" && "border-destructive/40",
        ENTER
      )}
    >
      <Button aria-label="Не сейчас" className="absolute top-2 right-2" onClick={r.dismiss} size="icon-xs" variant="ghost">
        <X />
      </Button>
      <div className="pr-6">
        <Head r={r} size={32} />
      </div>
      <SignIn layout="inline" r={r} />
    </div>
  );
  return (
    <>
      <ChatFrame dock={dock} inFeed={mark} request={r} />
      <OAuthDialog flow={r.oauth} />
    </>
  );
};
