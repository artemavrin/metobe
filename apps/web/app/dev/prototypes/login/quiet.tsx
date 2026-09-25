"use client";

// «Тихий»: no card at all — the form sits on the page like a settings row, brand mark top-left, language top-right.
// Email and code replace each other in place with a short horizontal slide.
import { Button } from "@metobe/ui/components/button";
import { ArrowLeft, Check, MailX } from "lucide-react";

import {
  CodeInput,
  EmailForm,
  LanguagePicker,
  LOGIN_CSS,
  Mark,
  ResendButton,
  useCopy,
  useLoginFlow,
  useMailConfigured,
} from "./flow";

export const Quiet = () => {
  const flow = useLoginFlow();
  const t = useCopy();
  const mail = useMailConfigured();

  return (
    <div className="bg-background flex min-h-dvh flex-col">
      <style>{LOGIN_CSS}</style>
      <header className="flex items-center justify-between px-4 py-4 sm:px-6">
        <span className="flex items-center gap-2.5 text-sm font-semibold tracking-tight">
          <Mark className="size-7 rounded-lg text-xs" />
          Metobe
        </span>
        <LanguagePicker />
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pt-[14vh] pb-24 sm:px-6">
        <div className="w-full max-w-[340px]">
          {!mail ? (
            <div className="login-in" key="nomail">
              <MailX className="text-muted-foreground mb-5 size-5" />
              <h1 className="text-xl font-semibold tracking-tight">{t.title}</h1>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{t.mailNotConfigured}</p>
            </div>
          ) : flow.step === "email" ? (
            <div className={flow.email ? "login-in-back" : "login-in"} key="email">
              <h1 className="text-xl font-semibold tracking-tight">{t.title}</h1>
              <p className="text-muted-foreground mt-1.5 mb-7 text-sm">{t.description}</p>
              <EmailForm flow={flow} />
            </div>
          ) : flow.step === "code" ? (
            <div className="login-in-x" key="code">
              <Button
                className="text-muted-foreground -ml-2 mb-5 h-7 gap-1.5 px-2 font-normal"
                onClick={flow.back}
                size="sm"
                variant="ghost"
              >
                <ArrowLeft />
                {t.back}
              </Button>
              <h1 className="text-xl font-semibold tracking-tight">{t.code}</h1>
              <p className="text-muted-foreground mt-1.5 mb-7 text-sm">
                {t.sentTo} <span className="text-foreground font-medium">{flow.email}</span>
              </p>
              <CodeInput flow={flow} />
              <div className="text-muted-foreground mt-6 flex flex-col items-start gap-1 text-sm">
                <span>{t.orLink}</span>
                <ResendButton flow={flow} />
              </div>
            </div>
          ) : (
            <div className="login-pop" key="done">
              <span className="bg-success/15 text-success mb-5 inline-flex size-9 items-center justify-center rounded-full">
                <Check className="size-4.5" />
              </span>
              <h1 className="text-xl font-semibold tracking-tight">{t.done}</h1>
              <p className="text-muted-foreground mt-1.5 text-sm">{t.doneHint}</p>
              <Button className="text-muted-foreground -ml-2 mt-6 font-normal" onClick={flow.reset} size="sm" variant="ghost">
                ↺ ещё раз (прототип)
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
