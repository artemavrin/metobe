"use client";

import { fileUrl } from "@metobe/contracts/files";
import type { FileKind, FilePreview } from "@metobe/contracts/files";
import { Button } from "@metobe/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@metobe/ui/components/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@metobe/ui/components/empty";
import { IconTile } from "@metobe/ui/components/reui/icon-tile";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@metobe/ui/components/tabs";
import { cn } from "@metobe/ui/lib/utils";
import {
  ChartNoAxesColumn,
  Download,
  File,
  FileText,
  ImageIcon,
  Presentation,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Streamdown } from "streamdown";

import { useSize } from "@/components/settings/use-size";

// Files in the chat (D47): the card of a file the sandbox handed over, and the window that shows a file — a sheet as
// its tables, a document, a text, a PDF, a picture. Slides and archives are downloaded. Prototype P33/P34.

export interface ViewedFile {
  id: string;
  name: string;
  kind: FileKind | null;
  mediaType: string;
  size?: number;
}

const extOf = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toUpperCase() : "";
};

const ICONS: Record<FileKind, typeof File> = {
  doc: FileText,
  image: ImageIcon,
  other: File,
  pdf: FileText,
  sheet: ChartNoAxesColumn,
  text: FileText,
};

/** The file's glyph: slides by their name, the rest by their kind. */
const FileGlyph = ({ file }: { file: ViewedFile }) => {
  if (file.name.toLowerCase().endsWith(".pptx")) {
    return <Presentation />;
  }
  const Glyph = ICONS[file.kind ?? "other"];
  return <Glyph />;
};

/** What the window can show: a picture and a PDF as they are, the rest drawn by the server; slides and the like not. */
export const viewable = (file: ViewedFile) =>
  file.kind === "image" ||
  file.kind === "pdf" ||
  file.kind === "sheet" ||
  file.kind === "doc" ||
  (file.kind === "text" && file.mediaType !== "text/html");

/** Where a drawn file comes from: the app's preview route; a prototype passes its own. */
export type PreviewLoader = (
  file: ViewedFile,
  signal: AbortSignal
) => Promise<FilePreview | null>;

const fetchPreview: PreviewLoader = async (file, signal) => {
  const response = await fetch(`${fileUrl(file.id)}/preview`, { signal });
  return response.ok ? ((await response.json()) as FilePreview) : null;
};

const usePreview = (
  file: ViewedFile,
  on: boolean,
  load: PreviewLoader = fetchPreview
) => {
  const [state, setState] = useState<
    { status: "loading" } | { status: "failed" } | FilePreview
  >({ status: "loading" });
  useEffect(() => {
    if (!on) {
      return;
    }
    // A new file mounts a new body (keyed by its id): the state starts as «loading» there.
    const controller = new AbortController();
    const fill = async () => {
      try {
        const preview = await load(file, controller.signal);
        setState(preview ?? { status: "failed" });
      } catch {
        if (!controller.signal.aborted) {
          setState({ status: "failed" });
        }
      }
    };
    void fill();
    return () => controller.abort();
  }, [file, on, load]);
  return state;
};

/** A sheet's rows as a table: the first row is the header, it stays while the rows scroll. */
const NUMBER = /^-?\d+(?:\.\d+)?$/u;

const SheetTable = ({ rows }: { rows: string[][] }) => {
  const f = useFormatter();
  const [head = [], ...body] = rows;
  // A plain number reads with the locale's groups: 120 000, not 120000.
  const shown = (cell: string) =>
    NUMBER.test(cell)
      ? f.number(Number(cell), { maximumFractionDigits: 6 })
      : cell;
  return (
    <div className="h-full overflow-auto rounded-lg border">
      <table className="w-max min-w-full border-collapse text-[13px] tabular-nums">
        <thead className="bg-muted sticky top-0 z-10">
          <tr>
            <th className="text-muted-foreground w-10 border-r border-b px-2 py-1.5 text-right font-normal">
              <span className="sr-only">#</span>
            </th>
            {head.map((cell, i) => (
              <th
                className="border-r border-b px-3 py-1.5 text-left font-medium whitespace-nowrap"
                // oxlint-disable-next-line react/no-array-index-key -- a column has no other identity
                key={i}
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, r) => (
            // oxlint-disable-next-line react/no-array-index-key -- a row has no other identity
            <tr className="hover:bg-muted/40" key={r}>
              <td className="text-muted-foreground border-r border-b px-2 py-1 text-right">
                {r + 2}
              </td>
              {row.map((cell, c) => (
                <td
                  className={cn(
                    "max-w-80 truncate border-r border-b px-3 py-1",
                    NUMBER.test(cell) && "text-right"
                  )}
                  // oxlint-disable-next-line react/no-array-index-key -- a cell has no other identity
                  key={c}
                  title={cell}
                >
                  {shown(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/** A document's HTML in a frame with nothing allowed: it is drawn, never run or let into the page. */
const DocumentFrame = ({ html, title }: { html: string; title: string }) => (
  <iframe
    className="h-full w-full rounded-lg border bg-white"
    sandbox=""
    srcDoc={`<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>body{font:15px/1.6 system-ui,sans-serif;color:#111;max-width:46rem;margin:2rem auto;padding:0 1.5rem}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:4px 8px}img{max-width:100%}</style>${html}`}
    title={title}
  />
);

/** A file drawn: a picture, a PDF, a sheet's tables, a document, a text, or why it is not shown. */
export const FileBody = ({
  file,
  load,
  url: given,
}: {
  file: ViewedFile;
  load?: PreviewLoader;
  /** Where a picture or a PDF is read from: the file's own URL. */
  url?: string;
}) => {
  const t = useTranslations("chat.viewer");
  const url = given ?? fileUrl(file.id);
  const drawn = file.kind !== "image" && file.kind !== "pdf";
  const preview = usePreview(file, drawn && viewable(file), load);
  if (file.kind === "image") {
    return (
      // oxlint-disable-next-line nextjs/no-img-element -- the file as it is, from our own origin
      <img alt={file.name} className="h-full w-full object-contain" src={url} />
    );
  }
  if (file.kind === "pdf") {
    return (
      // The browser's own PDF viewer does not run in a sandboxed frame; the file is served with CSP `sandbox` itself.
      // oxlint-disable-next-line react/iframe-missing-sandbox
      <iframe
        className="h-full w-full rounded-lg border"
        src={url}
        title={file.name}
      />
    );
  }
  if (!viewable(file) || ("type" in preview && preview.type === "none")) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia>
            <IconTile size="lg" variant="frame">
              <File />
            </IconTile>
          </EmptyMedia>
          <EmptyTitle>{t("none.title")}</EmptyTitle>
          <EmptyDescription>{t("none.text")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  if ("status" in preview) {
    return preview.status === "loading" ? (
      <div className="bg-muted/40 h-full animate-pulse rounded-lg" />
    ) : (
      <p className="text-muted-foreground p-6 text-sm">{t("failed")}</p>
    );
  }
  if (preview.type === "sheet") {
    const [first] = preview.sheets;
    const cut = preview.cut && (
      <p className="text-muted-foreground text-xs">{t("cut")}</p>
    );
    if (preview.sheets.length === 1 && first) {
      return (
        <div className="flex h-full min-h-0 flex-col gap-2">
          <div className="min-h-0 flex-1">
            <SheetTable rows={first.rows} />
          </div>
          {cut}
        </div>
      );
    }
    return (
      <Tabs className="h-full min-h-0" defaultValue={0}>
        <TabsList className="max-w-full overflow-x-auto">
          {preview.sheets.map((s, i) => (
            <TabsTrigger key={s.name} value={i}>
              {s.name}
            </TabsTrigger>
          ))}
        </TabsList>
        {preview.sheets.map((s, i) => (
          <TabsContent className="min-h-0 flex-1" key={s.name} value={i}>
            <SheetTable rows={s.rows} />
          </TabsContent>
        ))}
        {cut}
      </Tabs>
    );
  }
  if (preview.type === "html") {
    return <DocumentFrame html={preview.html} title={file.name} />;
  }
  return (
    <div className="h-full overflow-auto rounded-lg border p-5">
      {preview.markdown ? (
        <Streamdown>{preview.text}</Streamdown>
      ) : (
        <pre className="font-mono text-[13px] whitespace-pre-wrap">
          {preview.text}
        </pre>
      )}
      {preview.cut && (
        <p className="text-muted-foreground mt-3 text-xs">{t("cut")}</p>
      )}
    </div>
  );
};

/** The window a file opens in: its name, what it is, «Download», and the file drawn; full screen on a phone. */
export const FileViewer = ({
  file,
  onClose,
  load,
}: {
  file: ViewedFile | null;
  onClose: () => void;
  load?: PreviewLoader;
}) => {
  const t = useTranslations("chat.viewer");
  const size = useSize();
  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={file !== null}>
      <DialogContent className="flex h-[min(52rem,calc(100dvh-3rem))] w-[min(72rem,calc(100vw-3rem))] max-w-none flex-col gap-3 p-3 max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:w-screen max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none sm:max-w-none">
        {file && (
          <>
            <div className="flex min-w-0 items-center gap-3 pr-10">
              <IconTile size="sm">
                <FileGlyph file={file} />
              </IconTile>
              <div className="flex min-w-0 flex-1 flex-col">
                <DialogTitle className="truncate text-sm font-medium">
                  {file.name}
                </DialogTitle>
                <span className="text-muted-foreground text-xs">
                  {[
                    extOf(file.name),
                    file.size === undefined ? "" : size(file.size),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <Button
                nativeButton={false}
                render={
                  <a
                    aria-label={t("download")}
                    download={file.name}
                    href={fileUrl(file.id)}
                  />
                }
                size="sm"
                variant="outline"
              >
                <Download />
                {t("download")}
              </Button>
            </div>
            <div className="min-h-0 flex-1">
              <FileBody file={file} key={file.id} load={load} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

/** A file the sandbox handed over, in the answer: what it is, «Open» when it can be shown, «Download». */
export const MadeFileCard = ({
  file,
  onOpen,
}: {
  file: ViewedFile;
  onOpen: () => void;
}) => {
  const t = useTranslations("chat.viewer");
  const size = useSize();
  const canView = viewable(file);
  return (
    <div className="bg-background flex w-full max-w-md items-center gap-3 rounded-xl border p-2.5 pr-3">
      <button
        aria-label={t("open", { name: file.name })}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left disabled:cursor-default"
        disabled={!canView}
        onClick={onOpen}
        type="button"
      >
        <IconTile size="default">
          <FileGlyph file={file} />
        </IconTile>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{file.name}</span>
          <span className="text-muted-foreground text-xs">
            {[extOf(file.name), file.size === undefined ? "" : size(file.size)]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
      </button>
      {canView && (
        <Button onClick={onOpen} size="sm" variant="ghost">
          {t("openShort")}
        </Button>
      )}
      <Button
        aria-label={t("download")}
        nativeButton={false}
        render={
          <a
            aria-label={t("download")}
            download={file.name}
            href={fileUrl(file.id)}
          />
        }
        size="icon-sm"
        variant="outline"
      >
        <Download />
      </Button>
    </div>
  );
};
