"use client";

// Attachments as a tray of cards above the text (the reference screenshot): an icon by kind — a chart for tables,
// brackets for code, a page for documents, the picture itself for images — the name, a thin upload bar while the
// file goes to storage (ARCH §11: uploaded on pick), and × to take it back. Cards arrive with a short stagger and
// leave by shrinking away, so the tray never jumps.
import { cn } from "@metobe/ui/lib/utils";
import { ChartNoAxesColumn, Code, FileText, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { EASE } from "./shared";

export type TrayFile = {
  id: string;
  name: string;
  size: number;
  /** Object URL for images, to show the picture itself. */
  preview?: string;
  /** 0–1 while uploading, 1 when stored. */
  progress: number;
  leaving?: boolean;
};

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

export const useTray = () => {
  const [files, setFiles] = useState<TrayFile[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setInterval>>());
  useEffect(() => {
    const running = timers.current;
    return () => {
      for (const t of running) {
        clearInterval(t);
      }
    };
  }, []);

  const add = useCallback((list: File[] | { name: string; size: number }[]) => {
    const fresh = list.map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      preview: f instanceof File && f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
      progress: f instanceof File ? 0 : 1,
      size: f.size,
    }));
    setFiles((fs) => [...fs, ...fresh]);
    // The upload itself is simulated here: a steady bar that finishes in well under a second for small files.
    for (const f of fresh.filter((x) => x.progress < 1)) {
      const t = setInterval(() => {
        setFiles((fs) => fs.map((x) => (x.id === f.id ? { ...x, progress: Math.min(1, x.progress + 0.18) } : x)));
      }, 90);
      timers.current.add(t);
      setTimeout(() => {
        clearInterval(t);
        timers.current.delete(t);
      }, 700);
    }
  }, []);

  const remove = useCallback((id: string) => {
    setFiles((fs) => fs.map((f) => (f.id === id ? { ...f, leaving: true } : f)));
    setTimeout(() => setFiles((fs) => fs.filter((f) => f.id !== id)), 160);
  }, []);

  return { add, clear: () => setFiles([]), files: files.filter((f) => !f.leaving), remove, shown: files };
};
export type Tray = ReturnType<typeof useTray>;

export const FileCard = ({ f, onRemove, index = 0 }: { f: TrayFile; onRemove?: () => void; index?: number }) => (
  <div
    className={cn(
      "group/file bg-background relative flex h-9 shrink-0 items-center gap-2 overflow-hidden rounded-lg border pr-3 pl-2.5 text-sm shadow-xs transition-[opacity,transform] duration-150",
      EASE,
      "animate-in fade-in slide-in-from-bottom-1 fill-mode-both motion-reduce:slide-in-from-bottom-0",
      f.leaving && "scale-95 opacity-0",
      onRemove && "pr-8"
    )}
    style={{ animationDelay: `${Math.min(index, 6) * 30}ms` }}
    title={`${f.name} · ${fmtSize(f.size)}`}
  >
    {f.preview ? (
      // biome-ignore lint: prototype preview of a local object URL
      <img alt="" className="size-6 rounded object-cover outline outline-1 -outline-offset-1 outline-black/10" src={f.preview} />
    ) : (
      <span className="text-foreground/70 flex [&_svg]:size-4">
        <KindIcon name={f.name} />
      </span>
    )}
    <span className="max-w-44 truncate">{f.name}</span>
    {onRemove && (
      <button
        aria-label={`Убрать ${f.name}`}
        className="text-muted-foreground hover:text-foreground hover:bg-muted absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded-md transition-[color,background-color,opacity] duration-150 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/file:opacity-100 focus-visible:opacity-100"
        onClick={onRemove}
        type="button"
      >
        <X className="size-3.5" />
      </button>
    )}
    {f.progress < 1 && (
      <span aria-hidden className="bg-muted absolute inset-x-0 bottom-0 h-0.5">
        <span className="bg-primary block h-full origin-left transition-transform duration-100 ease-linear" style={{ transform: `scaleX(${f.progress})` }} />
      </span>
    )}
  </div>
);

/** The tray inside the composer, above the text. Scrolls sideways when there are many. */
export const FileTray = ({ tray }: { tray: Tray }) =>
  tray.shown.length === 0 ? null : (
    <div className="flex gap-2 overflow-x-auto px-2 pt-1 pb-2 [scrollbar-width:none]">
      {tray.shown.map((f, i) => (
        <FileCard f={f} index={i} key={f.id} onRemove={() => tray.remove(f.id)} />
      ))}
    </div>
  );

/** Drag a file over the composer: a quiet overlay says where it goes. */
export const useDropZone = (onFiles: (f: File[]) => void) => {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const props = {
    onDragEnter: (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes("Files")) {
        depth.current += 1;
        setOver(true);
      }
    },
    onDragLeave: () => {
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) {
        setOver(false);
      }
    },
    onDragOver: (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes("Files")) {
        e.preventDefault();
      }
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      onFiles([...e.dataTransfer.files]);
    },
  };
  const overlay = over ? (
    <div className={cn("border-primary/50 bg-primary/5 text-primary pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] border-2 border-dashed text-sm font-medium", "animate-in fade-in duration-150", EASE)}>
      Отпустите, чтобы прикрепить
    </div>
  ) : null;
  return { overlay, props };
};
