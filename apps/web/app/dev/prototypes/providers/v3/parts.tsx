"use client";

// Pieces shared by the settings sections: section and settings rows, an edit-in-place value, a list row.
import { Button } from "@metobe/ui/components/button";
import { Input } from "@metobe/ui/components/input";
import { Kbd } from "@metobe/ui/components/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@metobe/ui/components/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@metobe/ui/components/popover";
import { cn } from "@metobe/ui/lib/utils";
import { ImageUp, RotateCcw } from "lucide-react";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";

import { BrandLogo, LOGOS } from "../../_p7/brand";

import { NO_AUTOFILL } from "../../_p7/shared";

export const Section = ({ title, meta, action, children }: { title: string; meta?: string; action?: ReactNode; children: ReactNode }) => (
  <section className="flex flex-col gap-3">
    <div className="flex items-end justify-between gap-3">
      <h2 className="text-sm font-semibold">
        {title}
        {meta && <span className="text-muted-foreground ml-2 font-normal">{meta}</span>}
      </h2>
      {action}
    </div>
    {children}
  </section>
);

export const Row = ({ label, hint, children, action }: { label: string; hint?: string; children: ReactNode; action?: ReactNode }) => (
  <div className="grid min-h-14 grid-cols-[180px_1fr_auto] items-center gap-4 px-4 py-3">
    <div className="flex flex-col">
      <span className="font-medium">{label}</span>
      {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
    </div>
    <div className="min-w-0">{children}</div>
    <div>{action}</div>
  </div>
);

/**
 * A settings row whose value is edited in place: «Изменить» turns the value into a field, Enter saves, Esc cancels
 * without leaving settings. `check` explains why a value can't be saved, before any request.
 */
export const EditRow = ({
  label,
  hint,
  value,
  placeholder,
  mono = true,
  startOpen = false,
  check,
  onSave,
  display,
}: {
  label: string;
  hint?: string;
  value: string;
  placeholder?: string;
  mono?: boolean;
  startOpen?: boolean;
  check?: (v: string) => string | null;
  onSave: (v: string) => void;
  display?: ReactNode;
}) => {
  const [open, setOpen] = useState(startOpen);
  const [draft, setDraft] = useState(value);
  const [tried, setTried] = useState(false);
  const problem = check?.(draft.trim()) ?? null;
  const save = () => {
    setTried(true);
    if (problem || !draft.trim()) return;
    onSave(draft.trim());
    setOpen(false);
  };
  const cancel = () => {
    setDraft(value);
    setTried(false);
    setOpen(false);
  };
  return (
    <Row
      action={
        open ? (
          <span className="flex gap-1">
            {value && (
              <Button onClick={cancel} size="sm" variant="ghost">
                Отмена
              </Button>
            )}
            <Button onClick={save} size="sm">
              Сохранить
            </Button>
          </span>
        ) : (
          <Button
            onClick={() => {
              setDraft(value);
              setOpen(true);
            }}
            size="sm"
            variant="ghost"
          >
            Изменить
          </Button>
        )
      }
      hint={hint}
      label={label}
    >
      {open ? (
        <div className="flex flex-col gap-1">
          <Input
            {...NO_AUTOFILL}
            aria-invalid={tried && Boolean(problem)}
            autoFocus
            className={cn("v3-appear max-w-md", mono && "font-mono")}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") {
                e.stopPropagation();
                cancel();
              }
            }}
            placeholder={placeholder}
            value={draft}
          />
          {tried && problem && <span className="v3-appear text-destructive text-xs">{problem}</span>}
        </div>
      ) : (
        (display ?? <span className={cn("truncate", mono && "font-mono")}>{value || <span className="text-muted-foreground">не задан</span>}</span>)
      )}
    </Row>
  );
};

/**
 * The selected-row background of a list → detail sidebar, sliding to the new row (spatial consistency: the detail
 * came from here). Rows mark themselves with data-active; the first placement doesn't slide.
 */
export const useListHighlight = (activeKey: string | undefined, count: number) => {
  const ref = useRef<HTMLElement>(null);
  const [box, setBox] = useState<{ y: number; h: number } | null>(null);
  const [ready, setReady] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the selection or the rows change
  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[data-active="true"]');
    setBox(el ? { h: el.offsetHeight, y: el.offsetTop } : null);
  }, [activeKey, count]);
  useEffect(() => {
    if (box && !ready) requestAnimationFrame(() => setReady(true));
  }, [box, ready]);
  const highlight = box ? (
    <span
      aria-hidden
      className={cn(
        "bg-sidebar-accent pointer-events-none absolute inset-x-2 top-0 rounded-lg",
        ready && "transition-transform duration-200 ease-[cubic-bezier(0.77,0,0.175,1)] motion-reduce:transition-none"
      )}
      style={{ height: box.h, transform: `translateY(${box.y}px)` }}
    />
  ) : null;
  return { highlight, ref };
};

/** The list column of a list → detail page: a second floating panel, styled like the shell's sidebar. */
export const LIST_PANEL =
  "bg-sidebar text-sidebar-foreground ring-sidebar-border my-2 flex w-80 shrink-0 flex-col overflow-hidden rounded-lg shadow-sm ring-1";

/** One row of a list → detail sidebar. */
export const ListRow = ({ active, onClick, media, title, sub, trail }: { active: boolean; onClick: () => void; media: ReactNode; title: ReactNode; sub: ReactNode; trail?: ReactNode }) => (
  <button
    className={cn(
      "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.99] motion-reduce:active:scale-100",
      !active && "hover:bg-sidebar-accent/60"
    )}
    data-active={active}
    onClick={onClick}
    type="button"
  >
    {media}
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate font-medium">{title}</span>
      <span className="text-muted-foreground flex items-center gap-1.5 truncate text-xs">{sub}</span>
    </span>
    {trail}
  </button>
);

/** Click the logo to change it: the built-in set (servers first for sources), an uploaded image, or back to automatic. */
export const LogoPicker = ({ value, label, onPick, size = 64, hosts = false }: { value: string | undefined; label: string; onPick: (logo: string | undefined) => void; size?: number; hosts?: boolean }) => {
  const file = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);
  // Bumped on each pick: the new logo pops in. Opening a detail page doesn't bump, so navigation stays still.
  const [bump, setBump] = useState(0);
  const pick = (logo: string | undefined) => {
    onPick(logo);
    setBump((n) => n + 1);
  };
  const take = (f: File | null | undefined) => {
    if (!f?.type.startsWith("image/")) return false;
    const reader = new FileReader();
    reader.onload = () => {
      pick(String(reader.result));
      setOpen(false);
    };
    reader.readAsDataURL(f);
    return true;
  };
  // While the picker is open, ⌘V / Ctrl+V takes an image from the clipboard (a copied file, a screenshot, or SVG markup).
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = [...(e.clipboardData?.items ?? [])];
      const img = items.find((i) => i.kind === "file" && i.type.startsWith("image/"));
      if (img && take(img.getAsFile())) return e.preventDefault();
      const text = e.clipboardData?.getData("text/plain").trim() ?? "";
      if (text.startsWith("<svg")) {
        e.preventDefault();
        pick(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`);
        setOpen(false);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <button
            aria-label="Сменить логотип"
            className="group relative rounded-[28%] transition-transform duration-150 ease-out active:scale-[0.97]"
            type="button"
          />
        }
      >
        <span className={cn("block", bump > 0 && "v3-pop")} key={bump}>
          <BrandLogo label={label} logo={value} size={size} />
        </span>
        <span className="bg-foreground/35 text-background absolute inset-0 backdrop-blur-[2px] flex items-center justify-center rounded-[28%] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <ImageUp className="size-5" />
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <div
          className={cn("relative flex flex-col gap-3", over && "[&>*]:opacity-30")}
          onDragLeave={() => setOver(false)}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            take(e.dataTransfer.files[0]);
          }}
        >
          {over && (
            <span className="v3-appear border-primary text-primary pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed text-sm font-medium opacity-100!">
              Отпустите, чтобы поставить
            </span>
          )}
          <span className="text-sm font-medium">Логотип</span>
          <div className="grid grid-cols-7 gap-1.5">
            {Object.entries(LOGOS)
              .sort(([, a], [, b]) => (hosts ? Number(Boolean(b.host)) - Number(Boolean(a.host)) : Number(Boolean(a.host)) - Number(Boolean(b.host))))
              .map(([slug, l]) => (
              <button
                aria-label={l.label}
                className={cn("v3-press rounded-lg p-1", value === slug ? "bg-muted ring-primary ring-2" : "hover:bg-muted")}
                key={slug}
                onClick={() => {
                  pick(slug);
                  setOpen(false);
                }}
                title={l.label}
                type="button"
              >
                <BrandLogo label={l.label} logo={slug} size={28} />
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 border-t pt-3">
            <Button onClick={() => file.current?.click()} size="sm" title="Или вставьте из буфера, или перетащите файл сюда" variant="outline">
              <ImageUp /> Загрузить своё <Kbd className="ml-1">⌘V</Kbd>
            </Button>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label="Вернуть автоматический логотип"
                    onClick={() => {
                      pick(undefined);
                      setOpen(false);
                    }}
                    size="icon-sm"
                    variant="ghost"
                  />
                }
              >
                <RotateCcw />
              </TooltipTrigger>
              <TooltipContent>Вернуть автоматический</TooltipContent>
            </Tooltip>
          </div>
          <input
            accept="image/png,image/svg+xml,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => take(e.target.files?.[0])}
            ref={file}
            type="file"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
};

