"use client";

import type { ModelLabel } from "@metobe/core/chat";
import { Button } from "@metobe/ui/components/button";
import { Textarea } from "@metobe/ui/components/textarea";
import { cn } from "@metobe/ui/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { BrandLogo } from "@/components/brand-logo";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

type SendState = "send" | "stop";

const SEND_ICON: Record<SendState, React.ReactNode> = {
  send: (
    <svg
      aria-hidden
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.2"
      viewBox="0 0 24 24"
    >
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  ),
  stop: <span className="size-3 rounded-[3px] bg-current" />,
};

/** The arrow flies out through the top when a message goes; the stop square settles in, and back. */
const SendButton = ({
  state,
  ready,
  onStop,
}: {
  state: SendState;
  ready: boolean;
  onStop: () => void;
}) => {
  const t = useTranslations("chat");
  // Where the morph comes from: send → stop sends the arrow up; stop → send brings it up from below.
  const [shown, setShown] = useState(state);
  const [from, setFrom] = useState(state);
  if (shown !== state) {
    setFrom(shown);
    setShown(state);
  }
  const dim = state === "send" && !ready;
  return (
    <Button
      aria-disabled={dim}
      aria-label={t(state)}
      className={cn(
        "relative size-9 overflow-hidden rounded-xl active:translate-y-0 active:scale-[0.97]",
        "[transition:scale_160ms_cubic-bezier(0.23,1,0.32,1),opacity_150ms_ease]",
        dim && "opacity-40"
      )}
      onClick={(e) => {
        if (state === "stop") {
          e.preventDefault();
          onStop();
        }
      }}
      size="icon"
      title={t(state)}
      type={state === "stop" ? "button" : "submit"}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          animate={{
            filter: "blur(0px)",
            opacity: 1,
            transform: "translateY(0%) scale(1)",
          }}
          className="flex items-center justify-center"
          exit={
            state === "stop"
              ? {
                  opacity: 0,
                  transform: "translateY(-100%) scale(1)",
                  transition: { duration: 0.15, ease: EASE_OUT },
                }
              : {
                  filter: "blur(2px)",
                  opacity: 0,
                  transform: "translateY(0%) scale(0.9)",
                  transition: { duration: 0.15, ease: EASE_OUT },
                }
          }
          initial={
            state === "send" && from === "stop"
              ? { opacity: 0, transform: "translateY(100%) scale(1)" }
              : {
                  filter: "blur(2px)",
                  opacity: 0,
                  transform: "translateY(0%) scale(0.9)",
                }
          }
          key={state}
          transition={{ duration: 0.2, ease: EASE_OUT }}
        >
          {SEND_ICON[state]}
        </motion.span>
      </AnimatePresence>
    </Button>
  );
};

/** The model the next message goes to. Picking another one comes with the favorites picker (P3). */
const ModelChip = ({ model }: { model: ModelLabel }) => {
  const t = useTranslations("chat");
  return (
    <span
      aria-label={t("model", { title: model.title })}
      className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm"
    >
      {/* Only a real logo here: a letter without its tile would look like a glitch at this size */}
      {model.providerLogo && (
        <BrandLogo
          label={model.providerTitle ?? model.title}
          logo={model.providerLogo}
          size={18}
          tile={false}
        />
      )}
      <span className="max-w-[180px] truncate">{model.title}</span>
    </span>
  );
};

/**
 * The composer «Щелчок» (P2): a grey shell with the white card nested in it — the band on top of the card (files,
 * the context) arrives with attachments. Enter sends, Shift+Enter breaks the line, Esc stops an answer.
 */
export const Composer = ({
  home,
  model,
  busy,
  onSend,
  onStop,
}: {
  /** An empty chat: the composer sits in the middle, a bit taller. */
  home: boolean;
  model: ModelLabel;
  /** An answer is on its way: the button stops it instead of sending. */
  busy: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}) => {
  const t = useTranslations("chat");
  const [text, setText] = useState("");
  const ready = text.trim().length > 0;
  const submit = () => {
    if (!ready || busy) {
      return;
    }
    onSend(text.trim());
    setText("");
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {/* The shell: grey, the white card nested inside — radius 22 = 18 + 4 of padding */}
      <div className="bg-muted/70 dark:bg-muted/40 ring-border/70 rounded-[22px] p-1 ring-1">
        <div
          className={cn(
            "bg-background border-border/80 flex flex-col rounded-[18px] border shadow-xs",
            "focus-within:border-foreground/15 [transition:border-color_200ms_ease,box-shadow_200ms_ease]",
            "focus-within:shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_1px_2px_-1px_rgba(0,0,0,0.06),0_2px_4px_0_rgba(0,0,0,0.04)] dark:focus-within:shadow-xs"
          )}
        >
          <Textarea
            aria-label={t("placeholder")}
            autoFocus
            className={cn(
              "max-h-60 resize-none rounded-none border-0 bg-transparent px-3 pt-3 pb-1 leading-7 shadow-none focus-visible:ring-0 md:leading-7 dark:bg-transparent",
              home ? "min-h-24" : "min-h-16"
            )}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                submit();
              } else if (e.key === "Escape" && busy) {
                e.preventDefault();
                onStop();
              }
            }}
            placeholder={t("placeholder")}
            value={text}
          />
          <div className="flex items-center gap-1 px-2 pt-1 pb-2">
            <ModelChip model={model} />
            <span className="ml-auto">
              <SendButton
                onStop={onStop}
                ready={ready}
                state={busy ? "stop" : "send"}
              />
            </span>
          </div>
        </div>
      </div>
      <p className="text-muted-foreground mt-2 text-center text-xs">
        {t("disclaimer")}
      </p>
    </form>
  );
};
