"use client";

import { cn } from "@metobe/ui/lib/utils";
import { TriangleAlert } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";

import type { Item } from "./data";
import { useEngine } from "./engine";
import { RemoveButton, StatusLine, VisionNote, useVisionNote } from "./parts";
import { EASE_OUT, Pill, Stage, Thumb, useViewer } from "./stage";

// «Колода»: файлы не занимают в композере ни строки. Они лежат стопкой бумаг, выглядывающих из-за верхнего края поля;
// наведение (или касание) раскрывает их веером над полем — каждая карточка с именем, состоянием и ×. Композер не
// меняет высоту вообще, сколько бы файлов ни было. В сообщении — такая же стопка, по клику раскрывается.

const CARD_W = 208;
const GAP = 8;
const MAX_FAN = 6;

/** Наклон и сдвиг карточки в стопке: детерминированно по месту, чтобы стопка не «дрожала» при перерисовке. */
const tilt = (i: number) => [0, -2.2, 1.8, -1, 2.4, -0.6][i % 6];

/** Карточка файла. В стопке видна только её верхняя полоска — значок и имя, поэтому они стоят наверху карточки. */
const Card = ({ item, removable }: { item: Item; removable: boolean }) => {
  const { open } = useViewer();
  const note = useVisionNote(item);
  return (
    <div
      className={cn(
        "bg-background ring-border/80 relative flex h-[60px] flex-col justify-start gap-1 rounded-xl px-2.5 pt-2 shadow-[0_1px_3px_rgb(0_0_0/0.06)] ring-1",
        item.status === "error" && "ring-destructive/40"
      )}
      style={{ width: CARD_W }}
    >
      <button className="flex min-w-0 items-center gap-2 text-left" onClick={() => open(item)} type="button">
        <Thumb className={cn("size-5 rounded-[5px]", item.status === "error" && "opacity-50")} item={item} />
        <span className="truncate text-xs font-medium leading-5">{item.name}</span>
      </button>
      <span className="pl-7">
        {item.status === "done" && note ? <VisionNote item={item} /> : <StatusLine item={item} />}
      </span>
      {removable && <RemoveButton className="absolute -top-1.5 -right-1.5" item={item} />}
    </div>
  );
};

/**
 * Стопка ↔ веер. В стопке видна верхняя карточка и края двух под ней; в веере — до шести рядом, остальные под «ещё N».
 * Движение — transform 200 мс сильным ease-out: прерывается и разворачивается с места (Motion ретаргетит).
 */
const Deck = ({ list, removable, align }: { list: Item[]; removable: boolean; align: "left" | "right" }) => {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const reduce = useReducedMotion();
  const fanned = hover || pinned;
  const shown = list.slice(0, MAX_FAN);
  const rest = list.length - shown.length;
  const failed = list.filter((i) => i.status === "error").length;
  const uploading = list.filter((i) => i.status === "uploading").length;
  if (list.length === 0) return null;
  const width = fanned ? shown.length * (CARD_W + GAP) - GAP : CARD_W + 16;
  return (
    <div
      className={cn("relative", align === "right" && "ml-auto")}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setPinned(false);
      }}
      onPointerEnter={(e) => e.pointerType === "mouse" && setHover(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setHover(false)}
      style={{ height: 56, width: Math.min(width, 9999) }}
    >
      {shown.map((item, i) => {
        const fanX = align === "right" ? -(shown.length - 1 - i) * (CARD_W + GAP) + (width - CARD_W) : i * (CARD_W + GAP);
        const pileX = (align === "right" ? width - CARD_W - 8 : 8) + (i === 0 ? 0 : i === 1 ? -6 : 6);
        const transform = fanned
          ? `translate(${fanX}px, ${removable ? -36 : 0}px) rotate(0deg)`
          : `translate(${pileX}px, ${Math.min(i, 2) * -4}px) rotate(${reduce ? 0 : tilt(i)}deg)`;
        return (
          <motion.div
            animate={{ opacity: fanned || i < 3 ? 1 : 0, transform }}
            className="absolute top-0 left-0"
            initial={false}
            key={item.id}
            style={{ zIndex: fanned ? 10 : shown.length - i }}
            transition={{ duration: reduce ? 0 : 0.2, ease: EASE_OUT }}
          >
            <Card item={item} removable={removable && fanned} />
          </motion.div>
        );
      })}
      {/* Сводка на стопке: сколько всего, что грузится, что сломалось — видна, пока колода сложена */}
      <button
        aria-expanded={fanned}
        aria-label={fanned ? "Сложить файлы" : `Показать файлы: ${list.length}`}
        className={cn(
          "bg-foreground text-background absolute -top-2 z-20 inline-flex h-5 min-w-5 items-center justify-center gap-1 rounded-full px-1.5 text-[11px] font-medium tabular-nums [transition:opacity_150ms_ease]",
          align === "right" ? "-left-2" : "-right-2",
          fanned && "pointer-events-none opacity-0"
        )}
        onClick={() => setPinned((p) => !p)}
        type="button"
      >
        {failed > 0 && <TriangleAlert className="text-destructive-foreground size-3" />}
        {list.length}
        {uploading > 0 && <span className="bg-background/70 size-1.5 animate-pulse rounded-full motion-reduce:animate-none" />}
      </button>
      {fanned && rest > 0 && (
        <span className="text-muted-foreground absolute -bottom-5 text-[11px]" style={{ [align === "right" ? "right" : "left"]: 0 }}>
          и ещё {rest}
        </span>
      )}
    </div>
  );
};

const DeckComposer = () => {
  const { draft, items } = useEngine();
  const list = draft.map((id) => items[id]);
  return (
    <div className="relative">
      {/* Колода стоит над полем, наполовину за его верхним краем — места в композере не занимает */}
      <div className="pointer-events-none absolute bottom-[calc(100%-32px)] left-4 z-0 [&>*]:pointer-events-auto">
        <Deck align="left" list={list} removable />
      </div>
      {/* Пилюля полупрозрачна — под ней непрозрачная подложка, чтобы стопка за краем не просвечивала */}
      <div className="bg-background relative z-10 rounded-[24px]">
        <Pill />
      </div>
    </div>
  );
};

const SentFiles = ({ items }: { items: Item[] }) => (
  <div className="flex justify-end pt-2 pb-1">
    <Deck align="right" list={items} removable={false} />
  </div>
);

export const DeckVariant = () => <Stage Files={SentFiles} composer={<DeckComposer />} />;
