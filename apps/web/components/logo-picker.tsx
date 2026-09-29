"use client";

import { Button } from "@metobe/ui/components/button";
import { Kbd } from "@metobe/ui/components/kbd";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@metobe/ui/components/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import { ImageUp, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { BrandLogo, LOGOS } from "@/components/brand-logo";
import { UserAvatar } from "@/components/user-avatar";
import { cropAvatar } from "@/lib/avatar-crop";

// Click a logo to change it (prototype P7): the built-in set, an image of your own (upload, drop or paste), or back
// to the automatic one. Uploaded images are kept as data URLs until there is file storage, hence the size cap.

/** An uploaded logo is shown at 28–64 px; anything bigger than this is a photo, not a logo. */
const MAX_BYTES = 256 * 1024;

export const LogoPicker = ({
  value,
  label,
  onPick,
  size = 64,
  hosts = false,
  person = false,
}: {
  value: string | undefined;
  label: string;
  /** `null` — back to the automatic logo. */
  onPick: (logo: string | null) => void;
  size?: number;
  /** Servers and services first (for sources), makers first otherwise. */
  hosts?: boolean;
  /** A person's picture: a round avatar with their initials, no built-in set, cropped to a square on upload. */
  person?: boolean;
}) => {
  const t = useTranslations("logoPicker");
  const file = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState(false);
  // Bumped on each pick: the new logo pops in. Opening a page doesn't bump, so navigation stays still.
  const [bump, setBump] = useState(0);
  const pick = (logo: string | null) => {
    onPick(logo);
    setBump((n) => n + 1);
    setOpen(false);
  };
  const takePerson = async (f: File) => {
    const data = await cropAvatar(f);
    if (data) {
      pick(data);
    } else {
      setError(true);
    }
  };
  const take = (f: File | null | undefined) => {
    if (!f?.type.startsWith("image/")) {
      return false;
    }
    if (person) {
      // A photo may be big: it is cut and shrunk here, and only the small square is kept.
      void takePerson(f);
      return true;
    }
    if (f.size > MAX_BYTES) {
      setError(true);
      return true;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => pick(String(reader.result)));
    reader.readAsDataURL(f);
    return true;
  };
  // While open, ⌘V / Ctrl+V takes an image from the clipboard: a copied file, a screenshot, or SVG markup.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onPaste = (e: ClipboardEvent) => {
      const items = [...(e.clipboardData?.items ?? [])];
      const image = items.find(
        (i) => i.kind === "file" && i.type.startsWith("image/")
      );
      if (image && take(image.getAsFile())) {
        e.preventDefault();
        return;
      }
      const text = e.clipboardData?.getData("text/plain").trim() ?? "";
      if (!person && text.startsWith("<svg") && text.length <= MAX_BYTES) {
        e.preventDefault();
        pick(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });
  // oxlint-disable-next-line unicorn/no-array-sort -- Object.entries is a fresh array; toSorted is past the ES target
  const logos = Object.entries(LOGOS).sort(([, a], [, b]) =>
    hosts
      ? Number(Boolean(b.host)) - Number(Boolean(a.host))
      : Number(Boolean(a.host)) - Number(Boolean(b.host))
  );
  return (
    <Popover
      onOpenChange={(next) => {
        setOpen(next);
        setError(false);
      }}
      open={open}
    >
      <PopoverTrigger
        render={
          <button
            aria-label={person ? t("avatarChange") : t("change")}
            className={cn(
              "group relative shrink-0 transition-transform duration-150 ease-out active:scale-[0.97]",
              "rounded-[28%]"
            )}
            type="button"
          />
        }
      >
        <span
          className={cn(
            "block",
            bump > 0 &&
              "animate-in fade-in zoom-in-90 motion-reduce:zoom-in-100 duration-250 ease-[cubic-bezier(0.23,1,0.32,1)]"
          )}
          key={bump}
        >
          {person ? (
            <span className="block" style={{ height: size, width: size }}>
              <UserAvatar
                className="size-full text-base"
                image={value}
                name={label}
              />
            </span>
          ) : (
            <BrandLogo label={label} logo={value} size={size} />
          )}
        </span>
        <span
          className={cn(
            "bg-foreground/35 text-background absolute inset-0 flex items-center justify-center opacity-0 backdrop-blur-[2px] transition-opacity duration-150 group-hover:opacity-100",
            "rounded-[28%]"
          )}
        >
          <ImageUp className="size-5" />
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <div
          className={cn(
            "relative flex flex-col gap-3",
            over && "[&>*]:opacity-30"
          )}
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
            <span className="border-primary text-primary pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed text-sm font-medium opacity-100!">
              {t("drop")}
            </span>
          )}
          <span className="text-sm font-medium">
            {person ? t("avatarTitle") : t("title")}
          </span>
          {!person && (
            <div className="grid grid-cols-7 gap-1.5">
              {logos.map(([slug, l]) => (
                <button
                  aria-label={l.label}
                  className={cn(
                    "rounded-lg p-1 transition-transform duration-150 ease-out active:scale-[0.97]",
                    value === slug
                      ? "bg-muted ring-primary ring-2"
                      : "hover:bg-muted"
                  )}
                  key={slug}
                  onClick={() => pick(slug)}
                  title={l.label}
                  type="button"
                >
                  <BrandLogo label={l.label} logo={slug} size={28} />
                </button>
              ))}
            </div>
          )}
          {person && (
            <p className="text-muted-foreground text-xs">{t("avatarHint")}</p>
          )}
          {error && (
            <p className="text-destructive text-xs">
              {person ? t("avatarBroken") : t("tooBig")}
            </p>
          )}
          <div className="flex items-center justify-between gap-2 border-t pt-3">
            <Button
              onClick={() => file.current?.click()}
              size="sm"
              title={t("uploadHint")}
              variant="outline"
            >
              <ImageUp /> {person ? t("avatarUpload") : t("upload")}{" "}
              <Kbd className="ml-1">⌘V</Kbd>
            </Button>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label={person ? t("avatarAuto") : t("auto")}
                    onClick={() => pick(null)}
                    size="icon-sm"
                    variant="ghost"
                  />
                }
              >
                <RotateCcw />
              </TooltipTrigger>
              <TooltipContent>
                {person ? t("avatarAuto") : t("auto")}
              </TooltipContent>
            </Tooltip>
          </div>
          <input
            accept={
              person
                ? "image/png,image/jpeg,image/webp,image/gif"
                : "image/png,image/svg+xml,image/jpeg,image/webp"
            }
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
