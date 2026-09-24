"use client";

// «Колода»: the onboarding card language carried to the door — a Frame with a navigation row and a rule, the next
// step peeking out behind it. Signing in is the first card of the same deck the admin later sees in onboarding.
import { Button } from "@metobe/ui/components/button";
import { Frame, FrameDescription, FrameHeader, FramePanel, FrameTitle } from "@metobe/ui/components/reui/frame";
import { Separator } from "@metobe/ui/components/separator";
import { cn } from "@metobe/ui/lib/utils";
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

const SURFACE = "bg-[color-mix(in_oklch,var(--muted)_50%,var(--background))]";

export const Deck = () => {
  const flow = useLoginFlow();
  const t = useCopy();
  const mail = useMailConfigured();
  const n = flow.step === "email" ? 1 : 2;
  const behind = mail && flow.step === "email" ? 1 : 0;

  const title = !mail ? t.title : flow.step === "email" ? t.title : flow.step === "code" ? t.code : t.done;
  const description = !mail ? t.mailNotConfigured : flow.step === "email" ? t.description : flow.step === "code" ? null : t.doneHint;

  return (
    <div className="bg-muted/40 flex min-h-dvh flex-col items-center px-4 pt-[12vh] pb-24 sm:px-6">
      <style>{LOGIN_CSS}</style>
      <LanguagePicker className="absolute top-4 right-4" />

      <div className="mb-8 flex items-center gap-2.5">
        <Mark />
        <span className="text-lg font-semibold tracking-tight">Metobe</span>
      </div>

      <div className="relative isolate w-full max-w-md">
        {/* The next card peeks out while there is one; it slides under as the step advances */}
        <div
          aria-hidden
          className={cn(SURFACE, "absolute inset-x-0 top-0 h-full origin-bottom rounded-xl border shadow-xs transition-[transform,opacity] duration-300 ease-out")}
          style={{
            opacity: behind ? 0.8 : 0,
            transform: behind ? "translateY(12px) scale(0.95)" : "translateY(0) scale(0.98)",
            zIndex: -1,
          }}
        />
        <Frame
          className={cn(SURFACE, "login-in relative shadow-lg")}
          key={`${mail}-${flow.step}`}
          spacing="lg"
          stacked
        >
          <div className="box-content flex h-6 items-center justify-between px-(--frame-panel-header-px) pt-3 pb-4">
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
              {mail && flow.step === "code" && (
                <Button aria-label={t.back} className="-ml-1.5" onClick={flow.back} size="icon-xs" variant="ghost">
                  <ArrowLeft />
                </Button>
              )}
              {!mail ? t.stepSignIn : flow.step === "done" ? t.stepDone : n === 1 ? t.stepEmail : t.stepCode}
            </span>
            {mail && (
              <span aria-label={`Шаг ${n} из 2`} className="flex items-center gap-1.5">
                {[1, 2].map((i) => (
                  <span
                    className={cn(
                      "h-1.5 rounded-full transition-[width,background-color] duration-300 ease-out",
                      flow.step === "done" ? "bg-primary w-1.5" : n === i ? "bg-primary w-5" : n > i ? "bg-primary/40 w-1.5" : "bg-border w-1.5"
                    )}
                    key={i}
                  />
                ))}
              </span>
            )}
          </div>
          <Separator className="opacity-60" />
          <FrameHeader className="gap-1 pt-4!">
            {!mail && <MailX className="text-muted-foreground mb-3 size-5" />}
            {flow.step === "done" && mail && (
              <span className="bg-success/15 text-success login-pop mb-3 inline-flex size-9 items-center justify-center rounded-full">
                <Check className="size-4.5" />
              </span>
            )}
            <FrameTitle className="text-xl">{title}</FrameTitle>
            {description && <FrameDescription>{description}</FrameDescription>}
            {mail && flow.step === "code" && (
              <FrameDescription>
                {t.sentTo} <span className="text-foreground font-medium">{flow.email}</span>
              </FrameDescription>
            )}
          </FrameHeader>
          {mail && flow.step !== "done" && (
            <FramePanel>
              {flow.step === "email" ? (
                <EmailForm flow={flow} />
              ) : (
                <div className="flex flex-col gap-5">
                  <CodeInput flow={flow} />
                  <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>{t.orLink}</span>
                    <ResendButton flow={flow} />
                  </div>
                </div>
              )}
            </FramePanel>
          )}
          {mail && flow.step === "done" && (
            <FramePanel>
              <Button className="text-muted-foreground -ml-2 font-normal" onClick={flow.reset} size="sm" variant="ghost">
                ↺ ещё раз (прототип)
              </Button>
            </FramePanel>
          )}
        </Frame>
      </div>
    </div>
  );
};
