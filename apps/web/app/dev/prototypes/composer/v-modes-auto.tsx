"use client";

// «Авто»: by default the composer picks the mode from the message itself — a short question goes «Быстро», a long
// text, a file or code goes «Глубоко» — and says why, right as you type. One click on a mode overrides it for
// this chat. The rule is plain and visible, not a guess hidden behind «умный режим».
import { InputGroupButton } from "@metobe/ui/components/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@metobe/ui/components/popover";
import { cn } from "@metobe/ui/lib/utils";
import { Wand2 } from "lucide-react";
import { useState } from "react";

import { MODES } from "./data";
import { type ModeId, ModeIcon, ModesField, useModesComposer } from "./modes-kit";
import { Segmented } from "./segmented";
import { type ComposerProps, EASE, ModelList, SendButton } from "./shared";

/** The rule, and the reason to show next to it. */
const pick = (text: string, files: number): { mode: ModeId; why: string } => {
  const t = text.trim();
  if (files > 0) {
    return { mode: "deep", why: "есть файл" };
  }
  if (/```|\bfunction\b|=>|;\s*$/mu.test(t)) {
    return { mode: "deep", why: "похоже на код" };
  }
  if (t.length > 400) {
    return { mode: "deep", why: "длинный текст" };
  }
  if (t.length > 0 && t.length < 60 && !t.includes("\n")) {
    return { mode: "fast", why: "короткий вопрос" };
  }
  return { mode: "normal", why: t ? "обычная задача" : "начните писать" };
};

export const ComposerModesAuto = (p: ComposerProps) => {
  const [open, setOpen] = useState(false);
  const [auto, setAuto] = useState(true);
  const [fixed, setFixed] = useState<ModeId>("normal");
  const c = useModesComposer({
    ...p,
    onHotkey: () => setOpen(true),
    resolveMode: (text, files) => (auto ? pick(text, files).mode : fixed),
  });
  const guess = pick(c.text, c.files.files.length);

  const bar = (
    <>
      <span className="flex min-w-0 items-center gap-2">
        {c.manual ? (
          <span className="flex items-center gap-1.5 text-xs">
            {c.model.title}
            <button className="text-muted-foreground hover:text-foreground underline-offset-2 transition-colors hover:underline" onClick={() => c.setManual(null)} type="button">
              вернуть режимы
            </button>
          </span>
        ) : (
          <Segmented
            label="Режим"
            onChange={(v) => {
              if (v === "auto") {
                setAuto(true);
              } else {
                setAuto(false);
                setFixed(v);
              }
            }}
            options={[
              { id: "auto" as const, label: (<><Wand2 /> Авто</>), tip: "Режим по сообщению: короткое — быстро, длинное, файл или код — глубоко" },
              ...MODES.map((m) => ({ id: m.id, label: <ModeIcon id={m.id} />, tip: `${m.title} — ${m.hint.toLowerCase()}` })),
            ]}
            value={auto ? "auto" : fixed}
          />
        )}
        {!c.manual && (
          <span className="text-muted-foreground flex min-w-0 items-center gap-1 truncate text-xs">
            <span className={cn("animate-in fade-in text-foreground flex items-center gap-1 duration-150", EASE)} key={c.current.id}>
              <ModeIcon className="size-3.5" id={c.current.id} /> {c.current.title}
            </span>
            {auto && <span className="truncate">· {guess.why}</span>}
            <span className="hidden truncate sm:inline">· {c.model.title}</span>
          </span>
        )}
      </span>
      <span className="ml-auto flex items-center gap-1">
        <Popover onOpenChange={setOpen} open={open}>
          <PopoverTrigger render={<InputGroupButton className="text-muted-foreground" size="xs" variant="ghost" />}>Точнее…</PopoverTrigger>
          <PopoverContent align="end" className="w-96 p-1" side="top">
            <ModelList
              current={c.model.id}
              onPick={(x) => {
                c.setManual(x.id);
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
        <SendButton disabled={!c.text.trim()} onStop={p.onStop} streaming={p.streaming} />
      </span>
    </>
  );

  return <ModesField {...p} bar={bar} c={c} />;
};
