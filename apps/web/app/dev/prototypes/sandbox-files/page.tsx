"use client";

import { fileUrl } from "@metobe/contracts/files";
import { Button } from "@metobe/ui/components/button";
import { IconTile } from "@metobe/ui/components/reui/icon-tile";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Maximize2,
  PanelRightClose,
  SquareTerminal,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  FileBody,
  FileGlyph,
  FileViewer,
  extOf,
} from "@/components/chat/file-viewer";
import type { ViewedFile } from "@/components/chat/file-viewer";

import { Picker } from "../_shared/picker";
import { CODE, FILES, OUTPUT, PICTURE, PICTURE_URL, loadMock } from "./data";

// P32–P34 · песочница (D47), раунд 2 (раунд 1 — /dev/prototypes/sandbox-files/round-1). По PlusPortal (FileCard.vue,
// FileViewPanel.vue): файл — карточкой во всю ширину колонки, ровным списком; нажатие — панель справа от переписки,
// файл смотрят рядом с разговором о нём. Панель сплошная, не стекло: таблица поверх ленты сквозь стекло не читается. Шапка панели в одну строку круглыми кнопками: листать файлы ответа ‹ 2/5 ›,
// «Раскрыть» широким окном, «Скачать», «Свернуть» в круглый значок у края, «Закрыть»; Esc закрывает. Картинка — самой
// картинкой, а не карточкой. На телефоне панель закрывает чат целиком.
//
// «Значок · рядом» — у карточки значок типа, панель встаёт колонкой и сужает переписку;
// «Значок · поверх» — та же карточка, панель лежит поверх переписки с тенью, лента не двигается;
// «Метка · рядом» — вместо значка метка типа словом (XLSX, DOCX), панель колонкой.

type Cover = "icon" | "label";
type Place = "beside" | "over";

const ALL = [PICTURE, ...FILES];

const Mounted = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? children : null;
};

const meta = (file: ViewedFile, ext = true) =>
  [
    ext ? extOf(file.name) : "",
    file.size === undefined
      ? ""
      : file.size < 1024 * 1024
        ? `${(file.size / 1024).toFixed(1).replace(".", ",")} КБ`
        : `${(file.size / 1024 / 1024).toFixed(1).replace(".", ",")} МБ`,
  ]
    .filter(Boolean)
    .join(" · ");

const urlOf = (file: ViewedFile) =>
  file.id === PICTURE.id ? PICTURE_URL : fileUrl(file.id);

const Tip = ({
  text,
  children,
}: {
  text: string;
  children: React.ReactElement;
}) => (
  <Tooltip>
    <TooltipTrigger delay={400} render={children} />
    <TooltipContent
      arrow={false}
      className="bg-sidebar text-foreground ring-foreground/10 shadow-md ring-1"
      sideOffset={6}
    >
      {text}
    </TooltipContent>
  </Tooltip>
);

/** Шаг ленты работы, как в раунде 1: свёрнут в строку, раскрывается в код и вывод. */
const CodeStep = () => {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-sm">
      <button
        className="text-muted-foreground hover:text-foreground flex items-center gap-2"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <SquareTerminal className="size-3.5" />
        Выполнил код
        <span className="tabular-nums">· 1,4 с</span>
        <ChevronRight
          className={cn("size-3.5 transition-transform", open && "rotate-90")}
        />
      </button>
      {open && (
        <div className="text-muted-foreground flex flex-col gap-2 pt-2 pl-6 text-xs">
          <span className="font-medium">Код</span>
          <pre className="bg-muted overflow-auto rounded-md p-2 font-mono whitespace-pre-wrap">
            {CODE}
          </pre>
          <span className="font-medium">Вывод</span>
          <pre className="bg-muted overflow-auto rounded-md p-2 font-mono whitespace-pre-wrap">
            {OUTPUT}
          </pre>
        </div>
      )}
    </div>
  );
};

const DownloadButton = ({
  file,
  className,
}: {
  file: ViewedFile;
  className?: string;
}) => (
  <Tip text="Скачать">
    <Button
      aria-label={`Скачать ${file.name}`}
      className={cn("text-muted-foreground", className)}
      nativeButton={false}
      render={<a download={file.name} href={urlOf(file)} />}
      size="icon-sm"
      variant="ghost"
    >
      <Download />
    </Button>
  </Tip>
);

/** Файл в ответе — во всю ширину колонки: заставка, название, тип и размер; «Открыть» и «Скачать» значками. */
const FileCard = ({
  file,
  cover,
  active,
  onOpen,
}: {
  file: ViewedFile;
  cover: Cover;
  active: boolean;
  onOpen: () => void;
}) => (
  <div
    className={cn(
      "bg-card flex w-full min-w-0 items-center gap-3 rounded-xl border py-2 pr-2 pl-2 transition-colors",
      active ? "border-foreground/30" : "hover:border-foreground/20"
    )}
  >
    <button
      aria-label={`Открыть: ${file.name}`}
      className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left outline-none"
      onClick={onOpen}
      type="button"
    >
      {cover === "label" ? (
        <span className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-lg text-[10px] font-semibold tracking-wide">
          {extOf(file.name)}
        </span>
      ) : (
        <IconTile size="default">
          <FileGlyph file={file} />
        </IconTile>
      )}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{file.name}</span>
        <span className="text-muted-foreground truncate text-xs">
          {meta(file, cover !== "label")}
        </span>
      </span>
    </button>
    <Tip text="Открыть">
      <Button
        aria-label={`Открыть ${file.name}`}
        className="text-muted-foreground"
        onClick={onOpen}
        size="icon-sm"
        variant="ghost"
      >
        <Eye />
      </Button>
    </Tip>
    <DownloadButton file={file} />
  </div>
);

/** Картинка — самой картинкой: её отдают, чтобы на неё посмотрели. Нажатие — панель, под картинкой подпись и «Скачать». */
const PictureCard = ({
  file,
  onOpen,
}: {
  file: ViewedFile;
  onOpen: () => void;
}) => (
  <figure className="bg-card flex w-fit max-w-full min-w-0 flex-col overflow-hidden rounded-xl border">
    <button
      aria-label={`Открыть: ${file.name}`}
      className="block cursor-zoom-in"
      onClick={onOpen}
      type="button"
    >
      {/* oxlint-disable-next-line nextjs/no-img-element -- prototype */}
      <img
        alt={file.name}
        className="block max-h-80 max-w-full object-contain"
        src={urlOf(file)}
      />
    </button>
    <figcaption className="text-muted-foreground flex min-w-0 items-center gap-2 border-t py-1 pr-1 pl-3 text-xs">
      <span className="min-w-0 flex-1 truncate">{file.name}</span>
      <span className="shrink-0 tabular-nums">{meta(file)}</span>
      <DownloadButton className="size-7" file={file} />
    </figcaption>
  </figure>
);

const ROUND =
  "text-muted-foreground hover:bg-muted hover:text-foreground flex size-8 shrink-0 items-center justify-center rounded-full transition-colors [&_svg]:size-4";

/** Панель просмотра: шапка в одну строку, тело — тот же просмотрщик, что в окне. Свёрнутая — круглый значок у края. */
const Panel = ({
  file,
  place,
  collapsed,
  onCollapse,
  onExpand,
  onStep,
  onClose,
  onWide,
}: {
  file: ViewedFile;
  place: Place;
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
  onExpand: () => void;
  onStep: (by: number) => void;
  onClose: () => void;
  onWide: () => void;
}) => {
  const index = ALL.findIndex((f) => f.id === file.id);
  if (collapsed) {
    return (
      <button
        aria-label={`Показать «${file.name}»`}
        className="bg-background/70 supports-[backdrop-filter]:bg-background/60 group hover:bg-muted absolute top-3 right-3 z-20 flex h-11 w-11 items-center overflow-hidden rounded-3xl border shadow-sm backdrop-blur-xs transition-all duration-300 hover:w-56 max-md:fixed"
        onClick={onExpand}
        type="button"
      >
        <span className="flex size-11 shrink-0 items-center justify-center [&_svg]:size-5">
          <FileGlyph file={file} />
        </span>
        <span className="truncate pr-3 text-sm opacity-0 transition-opacity group-hover:opacity-100">
          {file.name}
        </span>
      </button>
    );
  }
  return (
    <aside
      aria-label="Просмотр файла"
      className={cn(
        "bg-background flex h-full w-full flex-col overflow-hidden rounded-xl border",
        place === "over" ? "shadow-lg" : "shadow-none",
        "max-md:rounded-none max-md:border-0"
      )}
    >
      <div className="flex h-11 shrink-0 items-center gap-0.5 border-b pr-1.5">
        <span className="flex size-11 shrink-0 items-center justify-center [&_svg]:size-5">
          <FileGlyph file={file} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col pr-2">
          <span className="truncate text-sm">{file.name}</span>
        </span>
        <span className="text-muted-foreground mr-1 flex shrink-0 items-center text-xs tabular-nums">
          <button
            aria-label="Предыдущий файл"
            className={ROUND}
            disabled={index <= 0}
            onClick={() => onStep(-1)}
            type="button"
          >
            <ChevronLeft />
          </button>
          {index + 1}/{ALL.length}
          <button
            aria-label="Следующий файл"
            className={ROUND}
            disabled={index >= ALL.length - 1}
            onClick={() => onStep(1)}
            type="button"
          >
            <ChevronRight />
          </button>
        </span>
        <Tip text="Раскрыть">
          <button
            aria-label="Раскрыть широко"
            className={cn(ROUND, "max-md:hidden")}
            onClick={onWide}
            type="button"
          >
            <Maximize2 />
          </button>
        </Tip>
        <Tip text="Скачать">
          <a
            aria-label="Скачать файл"
            className={ROUND}
            download={file.name}
            href={urlOf(file)}
          >
            <Download />
          </a>
        </Tip>
        <Tip text="Свернуть">
          <button
            aria-label="Свернуть просмотр"
            className={cn(ROUND, "max-md:hidden")}
            onClick={() => onCollapse(true)}
            type="button"
          >
            <PanelRightClose />
          </button>
        </Tip>
        <Tip text="Закрыть">
          <button
            aria-label="Закрыть просмотр"
            className={ROUND}
            onClick={onClose}
            type="button"
          >
            <X />
          </button>
        </Tip>
      </div>
      <div className="min-h-0 flex-1 p-3">
        <FileBody
          file={file}
          key={file.id}
          load={loadMock}
          url={urlOf(file)}
        />
      </div>
    </aside>
  );
};

const Chat = ({ cover, place }: { cover: Cover; place: Place }) => {
  const [open, setOpen] = useState<ViewedFile | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [wide, setWide] = useState<ViewedFile | null>(null);

  const show = (file: ViewedFile) => {
    setOpen(file);
    setCollapsed(false);
  };
  const step = (by: number) => {
    const index = ALL.findIndex((f) => f.id === open?.id);
    const next = ALL[index + by];
    if (next) {
      setOpen(next);
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !wide) {
        setOpen(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [wide]);

  const docked = open !== null && !collapsed && place === "beside";

  return (
    <div className="bg-background relative flex h-dvh overflow-hidden">
      <div className="min-w-0 flex-1 overflow-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pt-10 pb-28">
          <div className="bg-muted ml-auto max-w-md rounded-2xl px-4 py-2.5 text-sm">
            Посчитай выручку по месяцам из файла и сделай Excel, отчёт, график
            и короткую презентацию
          </div>
          <CodeStep />
          <p className="text-sm leading-relaxed">
            Выручка растёт шесть месяцев подряд: с 120 тысяч в январе до 207
            тысяч в июне. Свёл итоги по месяцам в таблицу, написал отчёт,
            нарисовал график и собрал обзор на пять слайдов.
          </p>
          <PictureCard file={PICTURE} onOpen={() => show(PICTURE)} />
          <div className="flex flex-col gap-2">
            {FILES.map((f) => (
              <FileCard
                active={open?.id === f.id}
                cover={cover}
                file={f}
                key={f.id}
                onOpen={() => show(f)}
              />
            ))}
          </div>
        </div>
      </div>
      {/* Колонка рядом: распорка сужает ленту. Поверх: панель лежит над лентой справа. Телефон: во весь экран. */}
      <div
        className={cn(
          "shrink-0 transition-[width] duration-300 ease-out motion-reduce:transition-none max-md:hidden",
          docked ? "w-[min(40rem,48vw)]" : "w-0"
        )}
      />
      {open && (
        <div
          className={cn(
            collapsed
              ? "contents"
              : "absolute top-2 right-2 bottom-2 z-20 w-[min(40rem,calc(48vw-0.5rem))] max-md:fixed max-md:inset-0 max-md:w-auto"
          )}
        >
          <Panel
            collapsed={collapsed}
            file={open}
            onClose={() => setOpen(null)}
            onCollapse={setCollapsed}
            onExpand={() => setCollapsed(false)}
            onStep={step}
            onWide={() => setWide(open)}
            place={place}
          />
        </div>
      )}
      <FileViewer file={wide} load={loadMock} onClose={() => setWide(null)} />
    </div>
  );
};

const of = (cover: Cover, place: Place) => () => (
  <Mounted>
    <TooltipProvider delay={300}>
      <Chat cover={cover} place={place} />
    </TooltipProvider>
  </Mounted>
);

const SandboxFilesPrototypePage = () => (
  <Picker
    variants={[
      { Component: of("icon", "beside"), name: "Значок · рядом" },
      { Component: of("icon", "over"), name: "Значок · поверх" },
      { Component: of("label", "beside"), name: "Метка · рядом" },
    ]}
  />
);

export default SandboxFilesPrototypePage;
