"use client";

import { cn } from "@metobe/ui/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import type { Item } from "./data";
import { useEngine } from "./engine";
import { RemoveButton, StatusLine, VisionNote, useVisionNote } from "./parts";
import { Pill, Stage, Thumb, useAppear, useViewer } from "./stage";

// «Лоток»: файлы — ряд карточек над строкой ввода. Высота ряда постоянна: восьмой файл уезжает вправо, а не растит
// композер; края ряда гаснут, пока есть что прокрутить. В сообщении — картинки плиткой, документы карточками.

const Card = ({ item }: { item: Item }) => {
  const note = useVisionNote(item);
  return (
    <div
      className={cn(
        "group/card bg-background ring-border/80 relative flex h-14 w-56 shrink-0 items-center gap-2.5 rounded-xl p-2 pr-3 ring-1",
        item.status === "error" && "ring-destructive/40"
      )}
      title={note ?? undefined}
    >
      <Thumb className={cn("size-10", item.status === "error" && "opacity-50")} item={item} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-xs font-medium leading-4">{item.name}</span>
        {item.status === "done" && note ? <VisionNote item={item} /> : <StatusLine item={item} />}
      </div>
      <RemoveButton
        className="absolute -top-1.5 -right-1.5 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/card:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100 [transition:opacity_150ms_ease]"
        item={item}
      />
    </div>
  );
};

/** Ряд с гаснущими краями: маска только с той стороны, куда можно прокрутить. */
const Tray = ({ ids }: { ids: string[] }) => {
  const { items } = useEngine();
  const appear = useAppear();
  const row = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const count = ids.length;
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const update = () =>
      setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [count]);
  const mask = `linear-gradient(to right, ${edges.left ? "transparent, black 24px" : "black"}, ${edges.right ? "black calc(100% - 24px), transparent" : "black"})`;
  return (
    <AnimatePresence initial={false}>
      {count > 0 && (
        <motion.div
          animate={{ height: 72, opacity: 1 }}
          className="overflow-hidden"
          exit={{ height: 0, opacity: 0, transition: { duration: 0.18, ease: [0.23, 1, 0.32, 1] } }}
          initial={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <div
            className="no-scrollbar flex h-[72px] items-center gap-2 overflow-x-auto px-1.5 pt-1"
            ref={row}
            style={{ maskImage: mask, WebkitMaskImage: mask }}
          >
            <AnimatePresence initial={false} mode="popLayout">
              {ids.map((id) => (
                <motion.div key={id} layout="position" {...appear}>
                  <Card item={items[id]} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/** В сообщении: картинки — плиткой (до четырёх, дальше «+N»), документы — карточками. */
const SentFiles = ({ items }: { items: Item[] }) => {
  const { open } = useViewer();
  const images = items.filter((i) => i.kind === "image" && i.preview);
  const docs = items.filter((i) => !(i.kind === "image" && i.preview));
  const shown = images.slice(0, 4);
  return (
    <div className="flex max-w-[85%] flex-col items-end gap-1.5">
      {shown.length > 0 && (
        <div className={cn("grid gap-1", shown.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
          {shown.map((img, i) => (
            <button
              aria-label={`Открыть «${img.name}»`}
              className={cn(
                "ring-border/60 relative overflow-hidden rounded-xl ring-1 active:scale-[0.99]",
                shown.length === 1 ? "h-44 w-64" : "size-28"
              )}
              key={img.id}
              onClick={() => open(img)}
              type="button"
            >
              {/* biome-ignore lint: the preview is a data/object URL */}
              <img alt="" className={cn("size-full object-cover", img.status !== "done" && "opacity-60")} src={img.preview} />
              {img.status === "uploading" && <span className="bg-background/70 absolute inset-x-2 bottom-2 h-0.5 rounded-full" style={{ transform: `scaleX(${img.progress})`, transformOrigin: "left" }} />}
              {i === 3 && images.length > 4 && (
                <span className="bg-foreground/55 text-background absolute inset-0 grid place-items-center text-sm font-medium">
                  +{images.length - 4}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {docs.map((doc) => (
        <button
          className="bg-background ring-border/80 hover:bg-muted/50 flex w-64 items-center gap-2.5 rounded-xl p-2 pr-3 text-left ring-1 [transition:background-color_150ms_ease]"
          key={doc.id}
          onClick={() => open(doc)}
          type="button"
        >
          <Thumb className="size-10" item={doc} />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate text-xs font-medium leading-4">{doc.name}</span>
            <StatusLine item={doc} />
          </span>
        </button>
      ))}
    </div>
  );
};

const TrayComposer = () => {
  const { draft } = useEngine();
  return <Pill top={<Tray ids={draft} />} />;
};

export const TrayVariant = () => <Stage Files={SentFiles} composer={<TrayComposer />} />;
