"use client";

import { cn } from "@metobe/ui/lib/utils";
import { createContext, use, useEffect, useRef, useState } from "react";

// The compaction's life: the chat is heavy (the hint shows), the service model writes the summary («сжимаем…»), the
// chat is compacted (the summary in the thread, the model goes on from it), and — undone — heavy again. «Параметры»
// jump to any of them and add a question asked after the compaction.

export type Phase = "heavy" | "compacting" | "compacted";

interface Proto {
  phase: Phase;
  /** Hide the hint for now («Не сейчас»). */
  dismissed: boolean;
  dismiss: () => void;
  compact: () => void;
  undo: () => void;
  /** A question asked after the compaction, answered from the summary. */
  after: boolean;
  setPhase: (p: Phase) => void;
  setAfter: (v: boolean) => void;
}

const Ctx = createContext<Proto | null>(null);

/** How long the service model writes the summary, in the prototype. */
const WRITE_MS = 2600;

export const ProtoProvider = ({ children }: { children: React.ReactNode }) => {
  const [phase, setPhase] = useState<Phase>("heavy");
  const [dismissed, setDismissed] = useState(false);
  const [after, setAfter] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <Ctx
      value={{
        after,
        compact: () => {
          setPhase("compacting");
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setPhase("compacted"), WRITE_MS);
        },
        dismiss: () => setDismissed(true),
        dismissed,
        phase,
        setAfter,
        setPhase: (p) => {
          clearTimeout(timer.current);
          setDismissed(false);
          setPhase(p);
        },
        undo: () => {
          setAfter(false);
          setPhase("heavy");
        },
      }}
    >
      {children}
    </Ctx>
  );
};

export const useProto = () => {
  const p = use(Ctx);
  if (!p) throw new Error("useProto outside ProtoProvider");
  return p;
};

const Chip = ({ active, children, onClick }: { active?: boolean; children: React.ReactNode; onClick: () => void }) => (
  <button
    aria-pressed={active}
    className={cn("rounded-full px-2.5 py-1 transition-colors duration-150", active ? "bg-white/15 text-white" : "text-white/55 hover:text-white/85")}
    onClick={onClick}
    type="button"
  >
    {children}
  </button>
);

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-start justify-between gap-4">
    <span className="pt-1">{label}</span>
    <div className="flex max-w-72 flex-wrap justify-end gap-1">{children}</div>
  </div>
);

export const ProtoParams = () => {
  const { phase, setPhase, after, setAfter } = useProto();
  return (
    <>
      <Row label="состояние">
        {(
          [
            ["heavy", "чат тяжёлый"],
            ["compacting", "сжимаем"],
            ["compacted", "сжат"],
          ] as const
        ).map(([p, label]) => (
          <Chip active={phase === p} key={p} onClick={() => setPhase(p)}>
            {label}
          </Chip>
        ))}
      </Row>
      <Row label="после сжатия">
        <Chip active={after} onClick={() => setAfter(!after)}>
          + вопрос
        </Chip>
      </Row>
    </>
  );
};
