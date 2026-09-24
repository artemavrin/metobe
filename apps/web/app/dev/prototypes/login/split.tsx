"use client";

// «Раскол»: two halves — a brand panel (primary glow over a dot grid, one line about what this is) and the form on
// the plain surface. On a phone the panel folds into a short band above the form.
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

const TAGLINE = { en: "Your own AI workspace, on your server.", ru: "Своё AI-рабочее место на вашем сервере." };

const BrandPanel = () => {
  const t = useCopy();
  const tagline = t.title.startsWith("Sign") ? TAGLINE.en : TAGLINE.ru;
  return (
    <aside className="relative isolate flex overflow-hidden border-b bg-[color-mix(in_oklch,var(--primary)_10%,var(--background))] px-4 py-5 sm:px-6 lg:w-[44%] lg:flex-col lg:justify-between lg:border-r lg:border-b-0 lg:p-10">
      {/* Dot grid, faded toward the form side */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-[0.35] [background-image:radial-gradient(var(--foreground)_0.6px,transparent_0.6px)] [background-size:18px_18px] [mask-image:linear-gradient(to_right,black,transparent_85%)] dark:opacity-[0.18]"
      />
      <div
        aria-hidden
        className="bg-primary/35 absolute -bottom-40 -left-24 -z-10 size-[520px] rounded-full blur-[120px] dark:bg-primary/45"
      />
      <span className="flex items-center gap-2.5 text-sm font-semibold tracking-tight">
        <Mark className="size-7 rounded-lg text-xs" />
        Metobe
      </span>
      <p className="hidden max-w-sm text-3xl leading-[1.15] font-semibold tracking-tight text-balance lg:block">{tagline}</p>
      <span className="text-muted-foreground hidden font-mono text-xs lg:block">v0.2.0</span>
    </aside>
  );
};

export const Split = () => {
  const flow = useLoginFlow();
  const t = useCopy();
  const mail = useMailConfigured();

  return (
    <div className="bg-background relative flex min-h-dvh flex-col lg:flex-row">
      <style>{LOGIN_CSS}</style>
      <BrandPanel />
      <LanguagePicker className="absolute top-4 right-4 z-10" />
      <main className="relative flex flex-1 items-start justify-center px-4 pt-12 pb-24 sm:px-6 lg:items-center lg:pt-0">
        <div className="w-full max-w-sm">
          {!mail ? (
            <div className="login-in" key="nomail">
              <span className="bg-muted mb-6 inline-flex size-10 items-center justify-center rounded-xl border">
                <MailX className="text-muted-foreground size-5" />
              </span>
              <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
              <p className="text-muted-foreground mt-2 leading-relaxed">{t.mailNotConfigured}</p>
            </div>
          ) : flow.step === "email" ? (
            <div className={flow.email ? "login-in-back" : "login-in"} key="email">
              <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
              <p className="text-muted-foreground mt-2 mb-8">{t.description}</p>
              <EmailForm flow={flow} size="lg" />
            </div>
          ) : flow.step === "code" ? (
            <div className="login-in-x" key="code">
              <h1 className="text-2xl font-semibold tracking-tight">{t.code}</h1>
              <p className="text-muted-foreground mt-2 mb-8">
                {t.sentTo}{" "}
                <button
                  className="text-foreground decoration-border hover:decoration-foreground font-medium underline underline-offset-4 transition-colors"
                  onClick={flow.back}
                  title={t.back}
                  type="button"
                >
                  {flow.email}
                </button>
              </p>
              <CodeInput flow={flow} slotClassName="size-12 text-lg sm:size-13" />
              <p className="text-muted-foreground mt-6 text-sm">{t.orLink}</p>
              <div className="mt-8 flex items-center justify-between border-t pt-4 text-sm">
                <Button className="text-muted-foreground -ml-2 h-7 gap-1.5 px-2 font-normal" onClick={flow.back} size="sm" variant="ghost">
                  <ArrowLeft />
                  {t.back}
                </Button>
                <ResendButton flow={flow} />
              </div>
            </div>
          ) : (
            <div className="login-pop" key="done">
              <span className="bg-success/15 text-success mb-6 inline-flex size-10 items-center justify-center rounded-xl">
                <Check className="size-5" />
              </span>
              <h1 className="text-2xl font-semibold tracking-tight">{t.done}</h1>
              <p className="text-muted-foreground mt-2">{t.doneHint}</p>
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
