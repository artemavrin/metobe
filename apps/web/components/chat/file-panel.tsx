"use client";

import { fileUrl } from "@metobe/contracts/files";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize2,
  PanelRightClose,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { KeyboardEvent, PointerEvent } from "react";

import { FileBody, FileGlyph, FileViewer } from "@/components/chat/file-viewer";
import type { ViewedFile } from "@/components/chat/file-viewer";

// The file panel (P33/P34 round 2, as in PlusPortal): a file opens to the right of the chat, beside the talk about it
// rather than over it. The head is one row of round buttons — step through the chat's files, widen into the window,
// download, collapse to an icon at the edge, close; Esc closes. Its left edge is dragged like the sidebar's right one
// (arrows by 16 px, 48 with Shift, a double click puts the default back); the width is kept in the browser. On a phone
// the panel takes the whole screen. Without a host (tasks, prototypes) a file opens in the window, as before.

const KEY = "metobe.filePanelWidth";
const DEFAULT = 560;
const MIN = 360;
const MAX = 1200;
/** What the chat keeps beside the panel, at least. */
const CHAT_MIN = 420;
const STEP = 16;
const STEP_BIG = 48;

interface FilePanel {
  open: (file: ViewedFile) => void;
  /** The file in the panel now: its card is marked. */
  current: string | null;
  /** A card says its file is in the chat: the panel steps through them in that order. */
  register: (file: ViewedFile) => () => void;
}

const FilePanelContext = createContext<FilePanel | null>(null);

/** The panel of the chat around, or null: then the caller opens its file in the window. */
export const useFilePanel = () => use(FilePanelContext);

/** Puts a card's file on the panel's list while the card is there. */
export const useRegisterFile = (file: ViewedFile | null) => {
  const panel = useFilePanel();
  const register = panel?.register;
  useEffect(
    () => (file && register ? register(file) : undefined),
    [file, register]
  );
};

const readWidth = () => {
  try {
    const px = Number(localStorage.getItem(KEY));
    return Number.isFinite(px) && px > 0 ? px : DEFAULT;
  } catch {
    return DEFAULT;
  }
};

const saveWidth = (px: number | null) => {
  try {
    if (px === null) {
      localStorage.removeItem(KEY);
    } else {
      localStorage.setItem(KEY, String(px));
    }
  } catch {
    // Private mode: the width lasts this page only.
  }
};

const ROUND =
  "text-muted-foreground hover:bg-muted hover:text-foreground flex size-8 shrink-0 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4";

const Tip = ({
  text,
  children,
}: {
  text: string;
  children: React.ReactElement;
}) => (
  <Tooltip>
    <TooltipTrigger delay={500} render={children} />
    <TooltipContent
      arrow={false}
      className="bg-sidebar text-foreground ring-foreground/10 shadow-md ring-1"
      side="bottom"
      sideOffset={6}
    >
      {text}
    </TooltipContent>
  </Tooltip>
);

/** The left edge of the panel: a window splitter, as the sidebar's. */
const Resizer = ({
  box,
  width,
  onCommit,
}: {
  box: React.RefObject<HTMLDivElement | null>;
  width: number;
  onCommit: (px: number | null) => void;
}) => {
  const t = useTranslations("chat.viewer");
  const drag = useRef<{ x: number; start: number } | null>(null);
  const clamp = (px: number) => {
    const room =
      (box.current?.parentElement?.clientWidth ?? window.innerWidth) - CHAT_MIN;
    return Math.round(Math.max(MIN, Math.min(MAX, room, px)));
  };
  const apply = (px: number) => {
    box.current?.style.setProperty("width", `${px}px`);
  };
  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      start: box.current?.offsetWidth ?? width,
      x: event.clientX,
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current) {
      apply(clamp(drag.current.start - (event.clientX - drag.current.x)));
    }
  };
  const up = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) {
      return;
    }
    const px = clamp(drag.current.start - (event.clientX - drag.current.x));
    drag.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    apply(px);
    onCommit(px);
  };
  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? STEP_BIG : STEP;
    // The edge is on the left: to the left widens.
    let by = 0;
    if (event.key === "ArrowLeft") {
      by = step;
    } else if (event.key === "ArrowRight") {
      by = -step;
    } else {
      return;
    }
    event.preventDefault();
    const px = clamp(width + by);
    apply(px);
    onCommit(px);
  };
  return (
    <div
      aria-label={t("resize")}
      aria-orientation="vertical"
      aria-valuemax={MAX}
      aria-valuemin={MIN}
      aria-valuenow={width}
      // Laid over the panel's own left edge, as the sidebar's handle over its right one: the panel's border is 4 px in (pl-1),
      // the handle 1 px before it, with the same radius (8 px, the handle's own width, as the sidebar's), so the border it shows follows the corners instead of standing
      // apart as a second line. The `after:` strip carries the hit area on into the gutter.
      className="hover:border-foreground/20 focus-visible:border-ring active:border-foreground/35 absolute top-2 bottom-2 left-[3px] z-20 w-2 cursor-col-resize touch-none rounded-l-lg border-l-2 border-transparent transition-colors duration-150 outline-none after:absolute after:inset-y-0 after:right-full after:w-2.5 max-md:hidden"
      onDoubleClick={() => {
        apply(DEFAULT);
        onCommit(null);
      }}
      onKeyDown={key}
      onPointerCancel={up}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      // A window splitter: focusable, with a value and arrow keys — `hr` cannot be that.
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="separator"
      tabIndex={0}
    />
  );
};

const Head = ({
  file,
  files,
  onStep,
  onWide,
  onCollapse,
  onClose,
}: {
  file: ViewedFile;
  files: ViewedFile[];
  onStep: (file: ViewedFile) => void;
  onWide: () => void;
  onCollapse: () => void;
  onClose: () => void;
}) => {
  const t = useTranslations("chat.viewer");
  const index = files.findIndex((f) => f.id === file.id);
  const prev = index > 0 ? files[index - 1] : undefined;
  const next = index === -1 ? undefined : files[index + 1];
  return (
    <div className="flex h-11 shrink-0 items-center gap-0.5 border-b pr-1.5">
      <span className="flex size-11 shrink-0 items-center justify-center [&_svg]:size-5">
        <FileGlyph file={file} />
      </span>
      <h2 className="min-w-0 flex-1 truncate pr-2 text-sm font-normal">
        {file.name}
      </h2>
      {files.length > 1 && index !== -1 && (
        <span className="text-muted-foreground mr-1 flex shrink-0 items-center text-xs tabular-nums">
          <button
            aria-label={t("previous")}
            className={ROUND}
            disabled={!prev}
            onClick={() => prev && onStep(prev)}
            type="button"
          >
            <ChevronLeft />
          </button>
          {index + 1}/{files.length}
          <button
            aria-label={t("next")}
            className={ROUND}
            disabled={!next}
            onClick={() => next && onStep(next)}
            type="button"
          >
            <ChevronRight />
          </button>
        </span>
      )}
      <Tip text={t("widen")}>
        <button
          aria-label={t("widen")}
          className={cn(ROUND, "max-md:hidden")}
          onClick={onWide}
          type="button"
        >
          <Maximize2 />
        </button>
      </Tip>
      <Tip text={t("download")}>
        <a
          aria-label={t("download")}
          className={ROUND}
          download={file.name}
          href={fileUrl(file.id)}
        >
          <Download />
        </a>
      </Tip>
      <Tip text={t("collapse")}>
        <button
          aria-label={t("collapse")}
          className={cn(ROUND, "max-md:hidden")}
          onClick={onCollapse}
          type="button"
        >
          <PanelRightClose />
        </button>
      </Tip>
      <Tip text={t("close")}>
        <button
          aria-label={t("close")}
          className={ROUND}
          onClick={onClose}
          type="button"
        >
          <X />
        </button>
      </Tip>
    </div>
  );
};

/** Wraps a chat: the thread on the left, the file panel on the right while a file is open. */
export const FilePanelHost = ({ children }: { children: React.ReactNode }) => {
  const t = useTranslations("chat.viewer");
  const [file, setFile] = useState<ViewedFile | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [wide, setWide] = useState<ViewedFile | null>(null);
  // Read in the browser: the panel is drawn only once a file is opened there, so the server never draws a width.
  const [width, setWidth] = useState(readWidth);
  const [files, setFiles] = useState<ViewedFile[]>([]);
  const box = useRef<HTMLDivElement>(null);
  // Each file's place, from when it was first seen: a streamed answer hands a new object each render, so a card
  // leaves and comes back, and must come back to its place, not to the end.
  const order = useRef(new Map<string, number>());

  const register = useCallback((added: ViewedFile) => {
    if (!order.current.has(added.id)) {
      order.current.set(added.id, order.current.size);
    }
    const place = (f: ViewedFile) => order.current.get(f.id) ?? 0;
    setFiles((list) =>
      // oxlint-disable-next-line unicorn/no-array-sort -- sorts its own copy; toSorted is past this project's ES target
      [...list.filter((f) => f.id !== added.id), added].sort(
        (a, b) => place(a) - place(b)
      )
    );
    return () => setFiles((list) => list.filter((f) => f.id !== added.id));
  }, []);

  // The panel stands in the shell, across pages: another chat closes it.
  const pathname = usePathname();
  const [shownOn, setShownOn] = useState(pathname);
  if (shownOn !== pathname) {
    setShownOn(pathname);
    setFile(null);
    setWide(null);
  }

  const open = useCallback((next: ViewedFile) => {
    setFile(next);
    setCollapsed(false);
  }, []);

  useEffect(() => {
    if (!file || collapsed) {
      return;
    }
    const onKey = (event: globalThis.KeyboardEvent) => {
      // A dialog over the page takes its own Esc.
      if (
        event.key === "Escape" &&
        !event.defaultPrevented &&
        !document.querySelector('[role="dialog"]')
      ) {
        setFile(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [file, collapsed]);

  const value = useMemo(
    () => ({ current: file?.id ?? null, open, register }),
    [file, open, register]
  );

  return (
    <FilePanelContext value={value}>
      <div className="relative flex h-dvh min-h-0 min-w-0 flex-1">
        {children}
        {file && !collapsed && (
          <div
            className="relative shrink-0 py-2 pr-2 pl-1 max-md:fixed max-md:inset-0 max-md:z-50 max-md:w-auto! max-md:p-0"
            ref={box}
            style={{ width }}
          >
            <Resizer
              box={box}
              onCommit={(px) => {
                setWidth(px ?? DEFAULT);
                saveWidth(px);
              }}
              width={width}
            />
            <aside
              aria-label={t("panel")}
              className="bg-background animate-in fade-in slide-in-from-right-4 flex h-full flex-col overflow-hidden rounded-lg border duration-200 motion-reduce:animate-none max-md:rounded-none max-md:border-0"
            >
              <Head
                file={file}
                files={files}
                onClose={() => setFile(null)}
                onCollapse={() => setCollapsed(true)}
                onStep={setFile}
                onWide={() => setWide(file)}
              />
              <div className="min-h-0 flex-1 p-3">
                <FileBody file={file} key={file.id} />
              </div>
            </aside>
          </div>
        )}
        {file && collapsed && (
          <button
            aria-label={t("show", { name: file.name })}
            className="bg-background group hover:bg-muted absolute top-14 right-3 z-20 flex h-11 w-11 items-center overflow-hidden rounded-3xl border shadow-sm transition-[width,background-color] duration-300 hover:w-56 focus-visible:w-56 motion-reduce:transition-none"
            onClick={() => setCollapsed(false)}
            type="button"
          >
            <span className="flex size-11 shrink-0 items-center justify-center [&_svg]:size-5">
              <FileGlyph file={file} />
            </span>
            <span className="truncate pr-3 text-sm opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              {file.name}
            </span>
          </button>
        )}
      </div>
      <FileViewer file={wide} onClose={() => setWide(null)} />
    </FilePanelContext>
  );
};
