"use client";

import type { ChatMessage } from "@metobe/contracts/chat";
import type { ModelLabel } from "@metobe/core/chat";
import { cn } from "@metobe/ui/lib/utils";
import { code } from "@streamdown/code";
import { Brain, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Streamdown } from "streamdown";

import "streamdown/styles.css";

import { BrandLogo } from "@/components/brand-logo";

const textOf = (message: ChatMessage) =>
  message.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("");

/** The user's message: a bubble on the right that rises in when it goes. */
export const UserMessage = ({ message }: { message: ChatMessage }) => (
  <div className="animate-in fade-in slide-in-from-bottom-1 motion-reduce:slide-in-from-bottom-0 flex flex-col items-end duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]">
    <div className="bg-muted max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 break-words whitespace-pre-wrap">
      {textOf(message)}
    </div>
  </div>
);

/** Who answers: the maker's logo and the model's name above the answer. */
const Byline = ({ label }: { label?: ModelLabel }) =>
  label ? (
    <span className="text-muted-foreground text-xs">{label.title}</span>
  ) : null;

const Avatar = ({ label }: { label?: ModelLabel }) =>
  label ? (
    <BrandLogo
      className="mt-0.5 shrink-0"
      label={label.providerTitle ?? label.title}
      logo={label.providerLogo ?? undefined}
      size={22}
    />
  ) : (
    <span className="size-[22px] shrink-0" />
  );

const Thinking = () => {
  const t = useTranslations("chat");
  return (
    <span className="text-muted-foreground animate-pulse text-sm motion-reduce:animate-none">
      {t("thinking")}
    </span>
  );
};

/** The model's reasoning, folded: what it thought is there for whoever wants it, the answer comes first. */
const Reasoning = ({ text }: { text: string }) => {
  const t = useTranslations("chat");
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-start gap-1">
      <button
        aria-expanded={open}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs transition-colors duration-150"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <Brain className="size-3.5" />
        {t("reasoning")}
        <ChevronRight
          className={cn(
            "size-3 transition-[rotate] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
            open && "rotate-90"
          )}
        />
      </button>
      {open && (
        <p className="text-muted-foreground border-border border-l pl-3 text-sm leading-relaxed whitespace-pre-wrap">
          {text}
        </p>
      )}
    </div>
  );
};

/** An answer: reasoning folded above, the text as markdown — new words fade in while it streams. */
export const AssistantMessage = ({
  message,
  label,
  streaming,
}: {
  message: ChatMessage;
  label?: ModelLabel;
  streaming: boolean;
}) => {
  const reasoning = message.parts
    .flatMap((p) => (p.type === "reasoning" ? [p.text] : []))
    .join("\n\n")
    .trim();
  const text = textOf(message);
  return (
    <div className="flex gap-3">
      <Avatar label={label} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Byline label={label} />
        {reasoning && <Reasoning text={reasoning} />}
        {text ? (
          <Streamdown
            animated
            caret={streaming ? "block" : undefined}
            className="leading-relaxed"
            isAnimating={streaming}
            plugins={{ code }}
          >
            {text}
          </Streamdown>
        ) : (
          streaming && <Thinking />
        )}
      </div>
    </div>
  );
};

/** Before the first chunk: the model that was asked, thinking. */
export const PendingAnswer = ({ label }: { label?: ModelLabel }) => (
  <div className="flex gap-3">
    <Avatar label={label} />
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <Byline label={label} />
      <Thinking />
    </div>
  </div>
);
