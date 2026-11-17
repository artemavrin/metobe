"use client";

import type { ModelLabel, ModelPayload } from "@metobe/contracts/chat";
import { Button } from "@metobe/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import { code } from "@streamdown/code";
import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Streamdown, defaultRehypePlugins } from "streamdown";
import type { Components } from "streamdown";

import { labelType, toneOf } from "@/lib/label-tone";
import { LABEL_TAG, labelLookup, rehypeLabels } from "@/lib/model-view";
import type { Piece } from "@/lib/model-view";

// What the model saw (PII-GUARD-PLAN З5, P31 «Лента · на месте»): a shield with the number of hidden values under
// each message and on each step of the work that had any; a click turns the text in place into the model's version —
// the person's message as it went, a step as the model sent and got it, the answer as the model wrote it — and back.
// Labels are chips in the colour of their kind (lib/label-tone.ts); the value shows on hover.

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

/** The new text comes in from a slight blur, without moving; under reduced motion it only fades. */
export const SWAP = `animate-in fade-in blur-in-3 duration-200 ${EASE} motion-reduce:blur-in-0`;

/** The chat's records: message id → what the model saw; empty where nothing was hidden. */
export const ModelPayloadsContext = createContext<Record<string, ModelPayload>>(
  {}
);

const NO_PAYLOADS: Record<string, ModelPayload> = {};

/**
 * A chat's records, read when it opens and when an answer ends — the record is kept just after the answer's
 * messages, so it is read once more a moment later.
 */
export const useModelPayloads = (
  chatId: string,
  busy: boolean,
  /** A new chat before its first message: nothing to read yet. */
  empty = false
) => {
  const [payloads, setPayloads] = useState(NO_PAYLOADS);
  const idle = !(busy || empty);
  useEffect(() => {
    if (!idle) {
      return;
    }
    let gone = false;
    const read = async () => {
      try {
        const response = await fetch(`/api/chat/${chatId}/payloads`, {
          cache: "no-store",
        });
        // A chat not saved yet has nothing to show.
        if (response.ok && !gone) {
          setPayloads((await response.json()) as Record<string, ModelPayload>);
        }
      } catch (error) {
        console.error("chat: could not read what the model saw", error);
      }
    };
    void read();
    const again = setTimeout(read, 2000);
    return () => {
      gone = true;
      clearTimeout(again);
    };
  }, [chatId, idle]);
  return payloads;
};

/** The thread's hints: the sidebar's surface, no arrow. */
const Tip = ({ children }: { children: ReactNode }) => (
  <TooltipContent
    arrow={false}
    className="bg-sidebar text-foreground ring-foreground/10 shadow-md ring-1"
    sideOffset={6}
  >
    {children}
  </TooltipContent>
);

/** A label as the model had it; its value on hover. */
export const LabelChip = ({
  label,
  value,
}: {
  label: string;
  value?: string;
}) => {
  const chip = cn(
    "cursor-default rounded-[5px] box-decoration-clone px-1 py-px font-mono text-[0.86em] leading-none tracking-tight",
    toneOf(labelType(label)).chip
  );
  if (value === undefined) {
    return <span className={chip}>{label}</span>;
  }
  return (
    <Tooltip>
      <TooltipTrigger delay={150} render={<span className={chip} />}>
        {label}
      </TooltipTrigger>
      <Tip>{value}</Tip>
    </Tooltip>
  );
};

/** Plain text as the model had it: the words as they are, labels as chips. */
export const Seen = ({ pieces }: { pieces: Piece[] }) =>
  pieces.map((p, i) =>
    typeof p === "string" ? (
      // oxlint-disable-next-line react/no-array-index-key -- pieces of one fixed text, in order
      <span key={i}>{p}</span>
    ) : (
      // oxlint-disable-next-line react/no-array-index-key -- the same label may stand more than once
      <LabelChip key={i} label={p.label} value={p.value} />
    )
  );

const REHYPE = [...Object.values(defaultRehypePlugins), rehypeLabels];

/** The record's labels for the chips inside the markdown: label → its value. */
const LookupContext = createContext(labelLookup([]));

/** A `<model-label>` the markdown step put in: a chip when the record knows it, plain text otherwise. */
const MarkdownLabel = ({ children }: { children?: ReactNode }) => {
  const find = useContext(LookupContext);
  const label = typeof children === "string" ? children : "";
  const known = find(label);
  return known ? <LabelChip label={label} value={known.value} /> : label;
};

/** The answer's markdown as the model wrote it: laid out as in the chat, labels as chips. */
export const SeenMarkdown = ({
  text,
  labels,
  components,
}: {
  text: string;
  labels: ModelLabel[];
  components?: Components;
}) => {
  const find = useMemo(() => labelLookup(labels), [labels]);
  const parts = useMemo(
    () => ({ ...components, [LABEL_TAG]: MarkdownLabel }) as Components,
    [components]
  );
  return (
    <LookupContext value={find}>
      <Streamdown
        components={parts}
        mode="static"
        plugins={{ code }}
        rehypePlugins={REHYPE}
      >
        {text}
      </Streamdown>
    </LookupContext>
  );
};

/** While the pointer is on the message (always on touch screens, and while it has the focus). */
export const ON_HOVER =
  "opacity-0 transition-opacity duration-150 group-hover/message:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100";

/**
 * The shield: the number of hidden values; pressed, green with what is on the screen now. Off the hover it hides
 * like the other actions, pressed it stays.
 */
export const LensMark = ({
  count,
  on,
  onToggle,
  label,
  hover = ON_HOVER,
  compact = false,
}: {
  count: number;
  on: boolean;
  onToggle: () => void;
  /** What the pressed shield shows: «Как получила модель». */
  label: string;
  /** How it hides while not pressed. */
  hover?: string;
  /** In a narrow row: on phones the pressed shield keeps its number instead of the words. */
  compact?: boolean;
}) => {
  const t = useTranslations("chat.lens");
  const hidden = t("hidden", { count });
  return (
    <Tooltip>
      <TooltipTrigger
        delay={500}
        render={
          <Button
            aria-label={`${label}. ${hidden}`}
            aria-pressed={on}
            className={cn(
              "text-muted-foreground hover:text-foreground h-6 shrink-0 gap-1 px-1.5 text-xs font-medium transition-[color,background-color,opacity,scale] duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100 [&_svg]:size-3.5",
              on
                ? "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-400"
                : hover
            )}
            onClick={onToggle}
            size="xs"
            type="button"
            variant="ghost"
          />
        }
      >
        <ShieldCheck />
        {on && (
          <span
            className={cn(
              "font-normal whitespace-nowrap",
              SWAP,
              compact && "max-sm:hidden"
            )}
          >
            {label}
          </span>
        )}
        <span
          className={cn(
            "tabular-nums",
            SWAP,
            on && (compact ? "sm:hidden" : "hidden")
          )}
          key={String(on)}
        >
          {count}
        </span>
      </TooltipTrigger>
      <Tip>
        {on ? (
          t("back")
        ) : (
          <span className="flex flex-col">
            <span>{label}</span>
            <span className="text-muted-foreground">{hidden}</span>
          </span>
        )}
      </Tip>
    </Tooltip>
  );
};

/** A shield's state: pressed or not; the text swaps with motion only once it was pressed, never on the page's first paint. */
export const useLens = () => {
  const [on, setOn] = useState(false);
  const [touched, setTouched] = useState(false);
  return {
    handleToggle: () => {
      setOn((was) => !was);
      setTouched(true);
    },
    on,
    set: (next: boolean) => {
      setOn(next);
      setTouched(true);
    },
    swap: touched ? SWAP : undefined,
  };
};
