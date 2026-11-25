"use client";

import { Badge } from "@metobe/ui/components/reui/badge";
import { Button } from "@metobe/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@metobe/ui/components/dialog";
import { cn } from "@metobe/ui/lib/utils";
import { ChevronLeft, Menu } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";

import { useProto } from "../memory/frame";
import { usePhone } from "../privacy/frame";
import { pct, pctTone, tariffById } from "./data";
import type { OrgStatus, PersonStatus, TariffId } from "./data";

// Рамка раздела «Платформа» в настройках суперюзера (ORGS-PLAN §10) — общая для P36 и P38. На компьютере — боковое
// меню настроек, на телефоне (узкое окно или `sz=phone`) — кадр 390 px со строкой заголовка и «назад».

export type PlatformPage = "orgs" | "people" | "bills" | "tariffs" | "forecast";

const MENU: { id: PlatformPage | "rates" | "spend"; label: string; href?: string }[] = [
  { href: "/dev/prototypes/platform-orgs?scr=orgs", id: "orgs", label: "Организации" },
  { href: "/dev/prototypes/platform-orgs?scr=people", id: "people", label: "Люди" },
  { href: "/dev/prototypes/platform-orgs?scr=bills", id: "bills", label: "Счета" },
  { href: "/dev/prototypes/platform-tariffs?scr=tariff", id: "tariffs", label: "Тарифы" },
  { href: "/dev/prototypes/platform-tariffs?scr=forecast", id: "forecast", label: "Прогноз" },
  { id: "rates", label: "Курсы и налоги" },
  { id: "spend", label: "Расходы" },
];

const INSTALL_MENU = ["Модели", "Источники", "Поиск в интернете", "Песочница", "Хранилище", "О системе"];

export const PlatformWindow = ({
  page,
  title,
  back,
  onNavigate,
  children,
}: {
  page: PlatformPage;
  title: string;
  /** На телефоне — стрелка назад в строке заголовка. */
  back?: () => void;
  /** Переход внутри прототипа; без него пункт меню — ссылка на другой прототип. */
  onNavigate?: (page: PlatformPage) => boolean;
  children: ReactNode;
}) => {
  const phone = usePhone();
  const item = (m: (typeof MENU)[number]) => {
    const active = m.id === page;
    const cls = cn("rounded-md px-2 py-1.5 text-left", active ? "bg-sidebar-accent font-medium" : "text-muted-foreground hover:text-foreground", !m.href && "pointer-events-none");
    if (!m.href) return <span className={cls} key={m.id}>{m.label}</span>;
    return (
      <Link
        className={cls}
        href={m.href}
        key={m.id}
        onClick={(e) => {
          if (onNavigate?.(m.id as PlatformPage)) e.preventDefault();
        }}
      >
        {m.label}
      </Link>
    );
  };
  if (phone) {
    return (
      <div className="bg-muted/40 flex min-h-dvh justify-center py-8 max-sm:py-0">
        <div className="bg-background text-foreground relative flex h-[812px] w-[390px] flex-col overflow-hidden rounded-[2.5rem] border pt-6 shadow-xl max-sm:h-dvh max-sm:w-full max-sm:rounded-none max-sm:border-0 max-sm:pt-0">
          <div className="flex h-12 shrink-0 items-center gap-2 border-b px-2 text-sm font-medium">
            {back ? (
              <Button aria-label="Назад" onClick={back} size="icon-sm" variant="ghost">
                <ChevronLeft />
              </Button>
            ) : (
              <PhoneMenu page={page} />
            )}
            <span className="truncate">{title}</span>
          </div>
          <div className="@container min-h-0 flex-1 overflow-y-auto text-sm">{children}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="bg-background text-foreground flex h-dvh overflow-hidden">
      <aside className="bg-sidebar text-sidebar-foreground flex w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r p-2 text-sm">
        <span className="text-muted-foreground px-2 pt-2 pb-1 text-[11px] font-medium tracking-wide uppercase">Платформа</span>
        {MENU.map(item)}
        <span className="text-muted-foreground px-2 pt-4 pb-1 text-[11px] font-medium tracking-wide uppercase">Установка</span>
        {INSTALL_MENU.map((m) => (
          <span className="text-muted-foreground rounded-md px-2 py-1.5" key={m}>
            {m}
          </span>
        ))}
      </aside>
      <main className="@container min-w-0 flex-1 overflow-y-auto text-sm">{children}</main>
    </div>
  );
};

/** Меню разделов на телефоне — список ссылок в окне. */
const PhoneMenu = ({ page }: { page: PlatformPage }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button aria-label="Разделы" onClick={() => setOpen(true)} size="icon-sm" variant="ghost">
        <Menu />
      </Button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Платформа</DialogTitle>
          </DialogHeader>
          <nav className="flex flex-col gap-1 text-sm">
            {MENU.filter((m) => m.href).map((m) => (
              <Link className={cn("rounded-md px-2 py-2", m.id === page ? "bg-muted font-medium" : "text-muted-foreground")} href={`${m.href}&sz=phone`} key={m.id}>
                {m.label}
              </Link>
            ))}
          </nav>
        </DialogContent>
      </Dialog>
    </>
  );
};

// ── Мелочи ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export const Dot = ({ tone, className }: { tone: "ok" | "bad" | "warn" | "off" | "info"; className?: string }) => (
  <span
    className={cn(
      "size-2 shrink-0 rounded-full",
      tone === "ok" && "bg-success",
      tone === "bad" && "bg-destructive",
      tone === "warn" && "bg-warning",
      tone === "info" && "bg-info",
      tone === "off" && "bg-muted-foreground/40",
      className
    )}
  />
);

export const TariffBadge = ({ id }: { id: TariffId }) => (
  <Badge className="shrink-0" variant={id === "max" ? "invert-light" : id === "pro" ? "primary-light" : "outline"}>
    {tariffById(id).name}
  </Badge>
);

export const OrgStatusBadge = ({ status, trialUntil, short }: { status: OrgStatus; trialUntil?: string; short?: boolean }) => {
  if (status === "active") return <Badge variant="success-light">Активна</Badge>;
  if (status === "trial") return <Badge variant="info-light">{short || !trialUntil ? "Пробная" : `Пробная до ${trialUntil}`}</Badge>;
  if (status === "off-unpaid") return <Badge variant="destructive-light">{short ? "Не оплачено" : "Отключена: не оплачено"}</Badge>;
  return <Badge variant="warning-light">{short ? "Отключена" : "Отключена вручную"}</Badge>;
};

export const PersonStatusBadge = ({ status }: { status: PersonStatus }) => {
  if (status === "active") return null;
  if (status === "invited") return <Badge variant="outline">Приглашён</Badge>;
  if (status === "off-owner") return <Badge variant="warning-light">Отключён владельцем</Badge>;
  return <Badge variant="destructive-light">Отключён платформой</Badge>;
};

/** Процент лимита — полоса и число; тон с 80 % и на 100 % одинаковый с P35 и P37. */
export const PctBar = ({ value, className, label }: { value: number | null; className?: string; label?: string }) => {
  if (value === null) return <span className={cn("text-muted-foreground text-xs", className)}>нет окна</span>;
  const tone = pctTone(value);
  return (
    <span aria-label={label ? `${label}: ${pct(value)}` : undefined} className={cn("flex items-center gap-2", className)}>
      <span className="bg-muted relative h-1.5 w-16 overflow-hidden rounded-full">
        <span
          className={cn("absolute inset-y-0 left-0 rounded-full", tone === "ok" && "bg-foreground/50", tone === "warn" && "bg-warning", tone === "full" && "bg-destructive")}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </span>
      <span className={cn("w-9 text-right text-xs tabular-nums", tone === "full" && "text-destructive font-medium")}>{pct(value)}</span>
    </span>
  );
};

export const Tile = ({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "warn" | "bad" }) => (
  <div className="bg-card flex min-w-0 flex-col gap-1 rounded-lg border px-4 py-3">
    <span className="text-muted-foreground text-xs">{label}</span>
    <span className={cn("truncate text-lg font-semibold tabular-nums", tone === "bad" && "text-destructive", tone === "warn" && "text-warning-foreground")}>{value}</span>
    {hint && <span className="text-muted-foreground truncate text-xs">{hint}</span>}
  </div>
);

/** Подтверждение отключения: что случится, одной фразой. */
export const ConfirmDialog = ({
  open,
  title,
  text,
  action,
  destructive,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  text: ReactNode;
  action: string;
  destructive?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) => (
  <Dialog onOpenChange={(o) => !o && onClose()} open={open}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{text}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button onClick={onClose} variant="outline">
          Отмена
        </Button>
        <Button
          onClick={() => {
            onConfirm();
            onClose();
          }}
          variant={destructive ? "destructive" : "default"}
        >
          {action}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

/** Строка-уведомление внизу (из `say` прототипа). */
export const NoteBar = () => {
  const { note } = useProto();
  if (!note) return null;
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 bg-foreground text-background fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-sm shadow-lg duration-200">
      {note.text}
    </div>
  );
};

/** Как `SettingsPageFrame`, но шире — для таблиц со многими столбцами. */
export const WideFrame = ({ children }: { children: ReactNode }) => (
  <div className="animate-in fade-in slide-in-from-bottom-1.5 fill-mode-both motion-reduce:slide-in-from-bottom-0 mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-4 pb-24 duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] md:gap-8 md:px-10 md:pt-8">
    {children}
  </div>
);
