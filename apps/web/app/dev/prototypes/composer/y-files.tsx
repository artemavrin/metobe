"use client";

// Round 4 «Щелчок»: the file tray with motion (spec §7 #29–#30). Same cards as x-files (an icon by kind, the
// picture for images, × to take it back), but they arrive on a spring from a little below, leave by shrinking away,
// and the neighbours slide into the gap instead of jumping. The upload bar fades when it is full.
import { cn } from "@metobe/ui/lib/utils";
import { ChartNoAxesColumn, Code, FileText, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import type { Tray, TrayFile } from "./x-files";
import { EASE_OUT, SNAP, SPRING_DRAG, SPRING_REFLOW } from "./y-motion";

const TABLE = /\.(csv|tsv|xlsx?|numbers)$/iu;
const CODE = /\.(ts|tsx|js|jsx|py|go|rs|java|rb|php|sql|json|ya?ml|sh|css|html)$/iu;

const KindIcon = ({ name }: { name: string }) => {
  if (TABLE.test(name)) {
    return <ChartNoAxesColumn />;
  }
  if (CODE.test(name)) {
    return <Code />;
  }
  return <FileText />;
};

const fmtSize = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} МБ` : `${Math.max(1, Math.round(n / 1000))} КБ`);

/** #30: the bar does not vanish at 100% — it fades out (150 ms), then unmounts. Stored files never get one. */
const UploadBar = ({ progress }: { progress: number }) => {
  const [shown, setShown] = useState(progress < 1);
  if (!shown) {
    return null;
  }
  const done = progress >= 1;
  return (
    <span
      aria-hidden
      className="bg-muted absolute inset-x-0 bottom-0 h-0.5 transition-opacity duration-150 ease-[ease] data-[done=true]:opacity-0"
      data-done={done}
      onTransitionEnd={(e) => {
        if (done && e.target === e.currentTarget && e.propertyName === "opacity") {
          setShown(false);
        }
      }}
    >
      <span className="bg-primary block h-full origin-left transition-transform duration-100 ease-linear" style={{ transform: `scaleX(${progress})` }} />
    </span>
  );
};

/**
 * Two layers on purpose: the outer one only reflows (layout), the inner one enters and leaves. Motion's layout
 * projection writes `transform` on its element, which would overwrite an animated `transform` string there.
 * `ref` goes to the outer layer: popLayout pops that one out of the flow while the inner one exits.
 */
const Card = ({
  f,
  delay,
  reduce,
  onRemove,
  ref,
}: {
  f: TrayFile;
  delay: number;
  reduce: boolean;
  onRemove: () => void;
  ref?: React.Ref<HTMLDivElement>;
}) => (
  <motion.div className="shrink-0" layout="position" ref={ref} transition={{ layout: reduce ? SNAP : SPRING_REFLOW }}>
    <motion.div
      animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
      className="group/file bg-background relative flex h-7 items-center gap-1.5 overflow-hidden rounded-md border pr-7 pl-2 text-[13px] shadow-xs"
      exit={{
        opacity: 0,
        transform: reduce ? "translateY(0px) scale(1)" : "translateY(0px) scale(0.95)",
        transition: { duration: 0.15, ease: EASE_OUT },
      }}
      initial={{ opacity: 0, transform: reduce ? "translateY(0px) scale(1)" : "translateY(6px) scale(0.95)" }}
      title={`${f.name} · ${fmtSize(f.size)}`}
      transition={{
        // Opacity on its own tween, so the spring's slight overshoot never shows as a flash.
        opacity: { delay, duration: 0.15, ease: EASE_OUT },
        transform: reduce ? SNAP : { ...SPRING_DRAG, delay },
      }}
    >
      {f.preview ? (
        // biome-ignore lint: prototype preview of a local object URL
        <img alt="" className="size-5 rounded-[4px] object-cover outline outline-1 -outline-offset-1 outline-black/10" src={f.preview} />
      ) : (
        <span className="text-foreground/70 flex [&_svg]:size-3.5">
          <KindIcon name={f.name} />
        </span>
      )}
      <span className="max-w-44 truncate">{f.name}</span>
      <button
        aria-label={`Убрать ${f.name}`}
        className="text-muted-foreground hover:text-foreground hover:bg-muted absolute top-1/2 right-1 flex size-5 -translate-y-1/2 items-center justify-center rounded-md transition-[color,background-color,opacity] duration-150 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/file:opacity-100 focus-visible:opacity-100"
        onClick={onRemove}
        type="button"
      >
        <X className="size-3" />
      </button>
      <UploadBar progress={f.progress} />
    </motion.div>
  </motion.div>
);

/**
 * The tray above the text. Renders `tray.files` (already without the ones being removed); stays mounted while
 * `tray.shown` still holds a leaving card, so the last one gets its exit too. A batch staggers by 30 ms a card.
 */
export const MotionFileTray = ({ tray }: { tray: Tray }) => {
  const reduce = useReducedMotion() ?? false;
  // Stagger inside the batch that just arrived, not by the position in the whole tray.
  const seen = useRef(new Set<string>());
  const fresh = tray.files.filter((f) => !seen.current.has(f.id)).map((f) => f.id);
  useEffect(() => {
    for (const f of tray.files) {
      seen.current.add(f.id);
    }
  });

  if (tray.shown.length === 0) {
    return null;
  }
  return (
    <motion.div className={cn("relative flex h-9 items-start gap-1.5 overflow-x-auto px-2 pt-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden")} layoutScroll>
      <AnimatePresence mode="popLayout">
        {tray.files.map((f) => (
          <Card delay={Math.min(Math.max(0, fresh.indexOf(f.id)), 6) * 0.03} f={f} key={f.id} onRemove={() => tray.remove(f.id)} reduce={reduce} />
        ))}
      </AnimatePresence>
    </motion.div>
  );
};
