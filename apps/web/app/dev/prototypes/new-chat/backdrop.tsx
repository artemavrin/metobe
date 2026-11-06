"use client";

import { cn } from "@metobe/ui/lib/utils";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";

import type { ComposerHandle } from "@/components/chat/composer";
import { Welcome as ProductWelcome } from "@/components/chat/welcome";
import { dayPart } from "@/lib/greeting";

import { ChatComposer, EASE_OUT, Screen, Thread, useData, useNewChat } from "./engine";
import { PhraseUnderDate } from "./phrases";

// Round 3: the screen as it ships (the greeting, «Начать с», the composer at the bottom) with something under it.
// Every variant is the product's own welcome and composer; only the layer behind them differs. The layer lives while
// the chat is empty and fades with the welcome on the first message. Knobs: the time of day (the greeting and the
// light follow it) and «меньше движения» — what a user with reduced motion gets.

export type DayPart = "morning" | "day" | "evening" | "night";
/** How the star sky's easter egg gathers its energy under the held pointer (round 4). */
export type Charge = "star" | "constellation" | "swirl" | "orb" | "hole";

interface Knobs {
  part: DayPart | "auto";
  setPart: (p: DayPart | "auto") => void;
  calm: boolean;
  setCalm: (v: boolean) => void;
  charge: Charge;
  setCharge: (c: Charge) => void;
}

const KnobsContext = createContext<Knobs | null>(null);

/** `?part=evening&calm=1&charge=star` — a state to send. */
export const KnobsProvider = ({ children }: { children: ReactNode }) => {
  const [part, setPart] = useState<DayPart | "auto">("auto");
  const [calm, setCalm] = useState(false);
  const [charge, setCharge] = useState<Charge>("star");
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const p = q.get("part");
    if (p === "morning" || p === "day" || p === "evening" || p === "night") setPart(p);
    if (q.get("calm") === "1") setCalm(true);
    const c = q.get("charge");
    if (c === "star" || c === "constellation" || c === "swirl" || c === "orb" || c === "hole") setCharge(c);
  }, []);
  return <KnobsContext value={{ calm, charge, part, setCalm, setCharge, setPart }}>{children}</KnobsContext>;
};

const useKnobs = () => {
  const knobs = useContext(KnobsContext);
  if (!knobs) throw new Error("useKnobs outside the round");
  return knobs;
};

/** The part of the day the screen shows: the knob, else this browser's clock (read after mount). */
export const usePart = (): DayPart | null => {
  const { part } = useKnobs();
  const [clock, setClock] = useState<DayPart | null>(null);
  useEffect(() => setClock(dayPart(new Date().getHours())), []);
  return part === "auto" ? clock : part;
};

export const useCharge = () => useKnobs().charge;

/** Reduced motion: the user's setting or the knob. */
export const useCalm = () => {
  const reduce = useReducedMotion();
  return useKnobs().calm || Boolean(reduce);
};

const Chip = ({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) => (
  <button
    aria-pressed={active}
    className={cn("rounded-full px-2.5 py-1 transition-colors duration-150", active ? "bg-white/15 text-white" : "text-white/55 hover:text-white/85")}
    onClick={onClick}
    type="button"
  >
    {children}
  </button>
);

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex items-start justify-between gap-4">
    <span className="pt-1">{label}</span>
    <div className="flex max-w-72 flex-wrap justify-end gap-1">{children}</div>
  </div>
);

const PARTS: [DayPart | "auto", string][] = [
  ["auto", "сейчас"],
  ["morning", "утро"],
  ["day", "день"],
  ["evening", "вечер"],
  ["night", "ночь"],
];

const CHARGES: [Charge, string][] = [
  ["star", "звезда"],
  ["constellation", "созвездие"],
  ["swirl", "вихрь"],
  ["orb", "сгусток"],
  ["hole", "чёрная дыра"],
];

export const BackdropParams = ({ eggs = false }: { eggs?: boolean }) => {
  const { part, setPart, calm, setCalm, charge, setCharge } = useKnobs();
  return (
    <>
      <Row label="время суток">
        {PARTS.map(([p, label]) => (
          <Chip active={part === p} key={p} onClick={() => setPart(p)}>
            {label}
          </Chip>
        ))}
      </Row>
      <Row label="движение">
        <Chip active={!calm} onClick={() => setCalm(false)}>
          обычное
        </Chip>
        <Chip active={calm} onClick={() => setCalm(true)}>
          меньше
        </Chip>
      </Row>
      {eggs && (
        <Row label="заряд (зажать 1 с)">
          {CHARGES.map(([c, label]) => (
            <Chip active={charge === c} key={c} onClick={() => setCharge(c)}>
              {label}
            </Chip>
          ))}
        </Row>
      )}
    </>
  );
};

/** What a backdrop gets: where the welcome and the composer stand, and whether a question is being typed. */
export interface StageView {
  welcome: RefObject<HTMLDivElement | null>;
  composer: RefObject<HTMLDivElement | null>;
  typing: boolean;
}

/** A draft in the composer: watched on its editor, so a server badge or a starter row counts as well as keys. */
const useTyping = (composer: RefObject<HTMLDivElement | null>) => {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const editor = composer.current?.querySelector<HTMLElement>('[contenteditable="true"]');
    if (!editor) return;
    const read = () => setTyping((editor.textContent ?? "").trim().length > 0 || editor.querySelector("[data-kind]") !== null);
    const watch = new MutationObserver(read);
    watch.observe(editor, { characterData: true, childList: true, subtree: true });
    read();
    return () => watch.disconnect();
  }, [composer]);
  return typing;
};

/**
 * The new chat as it ships, over a backdrop. The greeting follows the time-of-day knob; the backdrop fades in under
 * the welcome's own rise and leaves with it.
 */
export const Stage = ({ backdrop, phrase = false }: { backdrop?: (view: StageView) => ReactNode; phrase?: boolean }) => {
  const data = useData();
  const chat = useNewChat();
  const t = useTranslations("chat.greeting");
  const { part: knob } = useKnobs();
  const composerHandle = useRef<ComposerHandle>(null);
  const welcome = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLDivElement>(null);
  const typing = useTyping(composer);
  const greeting = knob === "auto" ? data.greeting : t(knob, { hasName: data.name ? "yes" : "no", name: data.name });
  return (
    <Screen>
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <AnimatePresence>
          {backdrop && chat.empty && (
            <motion.div
              animate={{ opacity: 1 }}
              aria-hidden
              className="pointer-events-none absolute inset-0"
              exit={{ opacity: 0, transition: { duration: 0.2, ease: EASE_OUT } }}
              initial={{ opacity: 0 }}
              key="backdrop"
              transition={{ duration: 0.4, ease: EASE_OUT }}
            >
              {backdrop({ composer, typing, welcome })}
            </motion.div>
          )}
        </AnimatePresence>
        <div className="relative min-h-0 flex-1" ref={welcome}>
          {!chat.empty && (
            <div className="h-full overflow-y-auto">
              <Thread chat={chat} />
            </div>
          )}
          <AnimatePresence initial={false}>
            {chat.empty && (
              <motion.div
                className="chat-rise absolute inset-0 overflow-y-auto"
                exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE_OUT } }}
                key="welcome"
              >
                <ProductWelcome
                  composer={composerHandle}
                  data={{ first: false, greeting, mailboxes: data.mailboxes, today: data.today }}
                  servers={chat.servers}
                />
                {phrase && <PhraseUnderDate welcome={welcome} />}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {/* Positioned, so it paints over the backdrop */}
        <div className="chat-rise chat-rise-next relative w-full px-4 pb-4 md:px-6">
          <div className="mx-auto max-w-4xl" ref={composer}>
            <ChatComposer chat={chat} composerRef={composerHandle} />
          </div>
        </div>
      </div>
    </Screen>
  );
};

/** «Как сейчас»: the screen as it ships, nothing under it. */
export const AsIs = () => <Stage />;
