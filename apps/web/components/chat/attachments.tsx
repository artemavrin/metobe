"use client";

import {
  ACCEPTED,
  FILE_MAX_BYTES,
  FILES_PER_MESSAGE,
  acceptedFile,
  fileIdOf,
  fileUrl,
  uploadedFileSchema,
} from "@metobe/contracts/files";
import type {
  FileKind,
  UploadError,
  UploadedFile,
} from "@metobe/contracts/files";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import type { FileUIPart } from "ai";
import {
  ChartNoAxesColumn,
  File,
  FileText,
  ImageIcon,
  RotateCw,
  TriangleAlert,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import {
  createContext,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

// Attachments in the composer — «Полка» (P · attachments): a file goes up the moment it is picked, dropped or pasted,
// and waits on a shelf of chips at the top of the pill: its type or its picture, its full name, a thin line along the
// bottom while it uploads. One line however many: the rest slides right under a fading edge. In a sent message the
// same chips stand above the text — a picture opens large, anything else opens or downloads.

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

type Problem = UploadError | "network" | "too-many";

export interface Attachment {
  /** Local until the upload answers; then the stored file's id. */
  key: string;
  name: string;
  /** Unknown for a file that already belongs to a message being edited. */
  size?: number;
  kind: FileKind | null;
  /** A picture's preview while it is only here (an object URL). */
  preview?: string;
  status: "uploading" | "done" | "error";
  progress: number;
  problem?: Problem;
  file?: File;
  uploaded?: UploadedFile;
  /** Already a message's file (an edit starts from them): taking it out only leaves the message, nothing is deleted. */
  existing?: boolean;
}

/** POST /api/files with progress (fetch has none for uploads). */
const upload = (file: File, onProgress: (p: number) => void) =>
  // oxlint-disable-next-line promise/avoid-new -- XMLHttpRequest has no promise form, and only it reports upload progress
  new Promise<UploadedFile>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/files");
    xhr.upload.addEventListener(
      "progress",
      (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    );
    xhr.addEventListener("load", () => {
      try {
        const body = JSON.parse(xhr.responseText) as unknown;
        if (xhr.status === 201) {
          resolve(uploadedFileSchema.parse(body));
          return;
        }
        reject(new Error((body as { error?: string }).error ?? "failed"));
      } catch {
        reject(new Error("failed"));
      }
    });
    xhr.addEventListener("error", () => reject(new Error("network")));
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });

let seq = 0;

const KNOWN = new Set<string>(["too-big", "type", "storage-off", "failed"]);

/** Deletes a stored file nobody will send (taken back from the composer); a failure leaves an orphan, not an error. */
const discard = async (id: string) => {
  try {
    await fetch(fileUrl(id), { method: "DELETE" });
  } catch {
    // The admin's storage page will find orphans; the composer has nothing to say about it.
  }
};

/** A picked file as the composer keeps it: refused here already when its type, size or the count says so. */
const toAttachment = (file: File, room: number): Attachment => {
  const accepted = acceptedFile(file.name);
  seq += 1;
  const base = {
    file,
    key: `local-${seq}`,
    kind: accepted?.kind ?? null,
    name: file.name,
    preview: accepted?.kind === "image" ? URL.createObjectURL(file) : undefined,
    progress: 0,
    size: file.size,
  };
  let problem: Problem | undefined;
  if (!accepted) {
    problem = "type";
  } else if (file.size > FILE_MAX_BYTES) {
    problem = "too-big";
  } else if (room <= 0) {
    problem = "too-many";
  }
  return problem
    ? { ...base, problem, status: "error" }
    : { ...base, status: "uploading" };
};

/** A sent file's kind by its media type (a message keeps the type, not our kind). */
export const kindOfMedia = (mediaType: string): FileKind => {
  if (mediaType.startsWith("image/")) {
    return "image";
  }
  const known = Object.values(ACCEPTED).find((a) => a.mediaType === mediaType);
  return known?.kind ?? "text";
};

/** A file part of a stored message as the shelf keeps it, for an edit to start from. */
const seeded = (part: FileUIPart): Attachment[] => {
  const id = fileIdOf(part.url);
  if (!id) {
    return [];
  }
  const kind = kindOfMedia(part.mediaType);
  return [
    {
      existing: true,
      key: part.url,
      kind,
      name: part.filename ?? "",
      preview: kind === "image" ? part.url : undefined,
      progress: 1,
      status: "done",
      uploaded: {
        id,
        kind,
        mediaType: part.mediaType,
        name: part.filename ?? "",
        size: 0,
      },
    },
  ];
};

/**
 * The composer's files: add (validated here first), take back, retry; `parts` — what a message carries. An edit starts
 * from the message's own files; `release` throws away what the edit uploaded when it is left unsent.
 */
export const useAttachments = (initial: FileUIPart[] = []) => {
  const [items, setItems] = useState<Attachment[]>(() =>
    initial.flatMap(seeded)
  );
  // The latest list for the handlers (refs are read in handlers, written after render).
  const current = useRef(items);
  useLayoutEffect(() => {
    current.current = items;
  });
  // Taken back while still uploading: when the upload answers, the stored file is deleted at once.
  const dropped = useRef(new Set<string>());
  const patch = useCallback(
    (key: string, change: Partial<Attachment>) =>
      setItems((all) =>
        all.map((a) => (a.key === key ? { ...a, ...change } : a))
      ),
    []
  );
  const start = useCallback(
    async (key: string, file: File) => {
      patch(key, { problem: undefined, progress: 0, status: "uploading" });
      try {
        const uploaded = await upload(file, (progress) =>
          patch(key, { progress })
        );
        if (dropped.current.has(key)) {
          await discard(uploaded.id);
          return;
        }
        patch(key, { progress: 1, status: "done", uploaded });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        patch(key, {
          problem: KNOWN.has(message) ? (message as Problem) : "network",
          status: "error",
        });
      }
    },
    [patch]
  );
  const add = useCallback(
    (files: File[]) => {
      let room =
        FILES_PER_MESSAGE -
        current.current.filter((a) => a.status !== "error").length;
      const next = files.map((file) => {
        const item = toAttachment(file, room);
        if (item.status === "uploading") {
          room -= 1;
        }
        return item;
      });
      setItems((all) => [...all, ...next]);
      for (const item of next) {
        if (item.status === "uploading" && item.file) {
          void start(item.key, item.file);
        }
      }
    },
    [start]
  );
  const remove = useCallback((key: string) => {
    dropped.current.add(key);
    const gone = current.current.find((a) => a.key === key);
    if (gone?.uploaded && !gone.existing) {
      void discard(gone.uploaded.id);
    }
    if (gone?.preview) {
      URL.revokeObjectURL(gone.preview);
    }
    setItems((all) => all.filter((a) => a.key !== key));
  }, []);
  const retry = useCallback(
    (key: string) => {
      const item = current.current.find((a) => a.key === key);
      if (item?.file) {
        void start(key, item.file);
      }
    },
    [start]
  );
  /** An edit left unsent: what it uploaded is deleted, the message's own files stay as they were. */
  const release = useCallback(() => {
    for (const a of current.current) {
      dropped.current.add(a.key);
      if (a.uploaded && !a.existing) {
        void discard(a.uploaded.id);
      }
      if (a.preview && !a.existing) {
        URL.revokeObjectURL(a.preview);
      }
    }
  }, []);
  /** After a send: the sent files leave the shelf (they now belong to the message), errors stay to retry or remove. */
  const clearSent = useCallback(
    () => setItems((all) => all.filter((a) => a.status === "error")),
    []
  );
  const parts: FileUIPart[] = items.flatMap((a) =>
    a.status === "done" && a.uploaded
      ? [
          {
            filename: a.uploaded.name,
            mediaType: a.uploaded.mediaType,
            type: "file",
            url: fileUrl(a.uploaded.id),
          },
        ]
      : []
  );
  return {
    add,
    clearSent,
    items,
    parts,
    release,
    remove,
    retry,
    uploading: items.filter((a) => a.status === "uploading").length,
  };
};

const ICON: Record<FileKind, typeof File> = {
  doc: FileText,
  image: ImageIcon,
  pdf: FileText,
  sheet: ChartNoAxesColumn,
  text: FileText,
};

/** What a chip needs to show, from a composer item or a sent file part. */
export interface ChipFile {
  key: string;
  name: string;
  kind: FileKind | null;
  preview?: string;
  status: Attachment["status"];
  progress: number;
  problem?: Problem;
  size?: number;
}

const useSize = () => {
  const format = useFormatter();
  return (bytes: number) =>
    bytes >= 1024 * 1024
      ? `${format.number(bytes / (1024 * 1024), { maximumFractionDigits: 1 })} МБ`
      : `${format.number(Math.max(1, Math.round(bytes / 1024)))} КБ`;
};

/** The leading glyph: the picture or the type; with a mouse it turns into × while the pointer is on the chip. */
const Lead = ({
  file,
  onRemove,
  label,
}: {
  file: ChipFile;
  onRemove?: () => void;
  label: string;
}) => {
  const failed = file.status === "error";
  let Icon = file.kind ? ICON[file.kind] : File;
  if (failed) {
    Icon = TriangleAlert;
  }
  const glyph =
    file.kind === "image" && file.preview && !failed ? (
      // oxlint-disable-next-line nextjs/no-img-element -- a 16 px preview of the user's own file (an object URL or ours)
      <img
        alt=""
        className="size-4 rounded-[4px] object-cover"
        src={file.preview}
      />
    ) : (
      <Icon
        className={cn(
          "size-4",
          failed ? "text-destructive" : "text-foreground/70"
        )}
        strokeWidth={1.75}
      />
    );
  if (!onRemove) {
    return (
      <span className="grid size-4 shrink-0 place-items-center">{glyph}</span>
    );
  }
  return (
    <span className="relative grid size-4 shrink-0 place-items-center">
      <span className="[transition:opacity_120ms_ease] [@media(hover:hover)]:group-hover/chip:opacity-0">
        {glyph}
      </span>
      <button
        aria-label={label}
        className="text-muted-foreground hover:text-foreground absolute inset-0 hidden place-items-center rounded-sm opacity-0 [transition:opacity_120ms_ease] focus-visible:opacity-100 [@media(hover:hover)]:grid [@media(hover:hover)]:group-hover/chip:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        type="button"
      >
        <X className="size-3.5" strokeWidth={2} />
      </button>
    </span>
  );
};

export const FileChip = ({
  file,
  onRemove,
  onRetry,
  onOpen,
}: {
  file: ChipFile;
  onRemove?: () => void;
  onRetry?: () => void;
  onOpen?: () => void;
}) => {
  const t = useTranslations("chat.files");
  const size = useSize();
  const failed = file.status === "error";
  let hint = file.size === undefined ? file.name : size(file.size);
  if (failed && file.problem) {
    hint = t(`problem.${file.problem}`);
  }
  const removeLabel = t("remove", { name: file.name });
  const chipClass = cn(
    "group/chip bg-background relative inline-flex h-8 max-w-64 shrink-0 items-center gap-2 overflow-hidden rounded-lg px-2.5 text-[13px] ring-1",
    failed ? "text-destructive ring-destructive/40" : "ring-border",
    file.status === "uploading" && "text-foreground/60"
  );
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          onOpen ? (
            <button
              aria-label={t("open", { name: file.name })}
              className={cn(
                chipClass,
                "hover:bg-muted/50 cursor-pointer [transition:background-color_150ms_ease]"
              )}
              onClick={onOpen}
              type="button"
            />
          ) : (
            <span className={chipClass} />
          )
        }
      >
        <Lead file={file} label={removeLabel} onRemove={onRemove} />
        <span className="truncate">{file.name}</span>
        {onRetry && failed && file.problem === "network" && (
          <button
            className="text-foreground hover:bg-foreground/[0.06] -mr-1 inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs [transition:background-color_150ms_ease]"
            onClick={onRetry}
            type="button"
          >
            <RotateCw className="size-3" /> {t("retry")}
          </button>
        )}
        {onRemove && (
          // A touch has no hover — × stands on the right.
          <button
            aria-label={removeLabel}
            className="text-muted-foreground -mr-1 grid size-5 shrink-0 place-items-center rounded-full [@media(hover:hover)]:hidden"
            onClick={onRemove}
            type="button"
          >
            <X className="size-3.5" />
          </button>
        )}
        {file.status === "uploading" && (
          <span className="absolute inset-x-0 bottom-0 h-[2px]">
            <span
              className="bg-foreground/50 block h-full origin-left transition-transform duration-150 ease-linear"
              style={{ transform: `scaleX(${file.progress})` }}
            />
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent side="top">{hint}</TooltipContent>
    </Tooltip>
  );
};

/** Appearing and leaving: from 0.96 and transparent, 180 ms strong ease-out; reduced motion keeps the fade only. */
const useAppear = () => {
  const reduce = useReducedMotion();
  return {
    animate: { opacity: 1, transform: "scale(1)" },
    exit: {
      opacity: 0,
      transform: reduce ? "scale(1)" : "scale(0.96)",
      transition: { duration: 0.15, ease: EASE_OUT },
    },
    initial: { opacity: 0, transform: reduce ? "scale(1)" : "scale(0.96)" },
    transition: { duration: 0.18, ease: EASE_OUT },
  };
};

/** One line of chips; the edge with more beyond it fades. */
export const Shelf = ({
  children,
  scroll,
}: {
  children: React.ReactNode;
  scroll: boolean;
}) => {
  const row = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const el = row.current;
    if (!el || !scroll) {
      return;
    }
    const update = () =>
      setEdges({
        left: el.scrollLeft > 2,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
      });
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    // A chip coming or going changes what is beyond the edge, not the row's own size.
    const mo = new MutationObserver(update);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
      mo.disconnect();
    };
  }, [scroll]);
  const mask = `linear-gradient(to right, ${edges.left ? "transparent, black 20px" : "black"}, ${edges.right ? "black calc(100% - 20px), transparent" : "black"})`;
  return (
    <div
      className={cn(
        "flex items-center gap-1.5",
        scroll
          ? "no-scrollbar overflow-x-auto px-1 pt-1 pb-1.5"
          : "flex-wrap justify-end p-px"
      )}
      ref={row}
      style={scroll ? { WebkitMaskImage: mask, maskImage: mask } : undefined}
    >
      {children}
    </div>
  );
};

/**
 * Where a file dropped on the chat screen goes instead of the composer: the message being edited sets it while it is
 * open (and clears it on leaving), so a file lands in the edit, not in a new message.
 */
export const FileSinkContext = createContext<{
  set: (take: ((files: File[]) => void) | null) => void;
}>({
  set: () => {
    // No chat screen around (a lone message): there is nowhere else to send a dropped file.
  },
});

/**
 * The composer's shelf: opens once the first file comes (grid-rows 0fr→1fr, 200 ms), the chips appear and leave. One
 * line that scrolls under a fading edge; `wrap` — the chips wrap to the right edge instead (a message being edited).
 */
export const ComposerShelf = ({
  attachments,
  wrap = false,
}: {
  attachments: ReturnType<typeof useAttachments>;
  wrap?: boolean;
}) => {
  const appear = useAppear();
  const { items, remove, retry } = attachments;
  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
        items.length > 0 ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <Shelf scroll={!wrap}>
          <AnimatePresence initial={false} mode="popLayout">
            {items.map((a) => (
              <motion.div
                className="shrink-0"
                key={a.key}
                layout="position"
                {...appear}
              >
                <FileChip
                  file={a}
                  onRemove={() => remove(a.key)}
                  onRetry={() => retry(a.key)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </Shelf>
      </div>
    </div>
  );
};
