"use client";

import { Badge } from "@metobe/ui/components/reui/badge";
import { Switch } from "@metobe/ui/components/switch";
import { TooltipContent } from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import {
  AtSign,
  Building2,
  CircleCheck,
  IdCard,
  Landmark,
  MapPin,
  Paperclip,
  Phone,
  Server,
  ShieldCheck,
  Sparkle,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { uniqueHidden } from "./data";
import type { Hidden, Kind, Model, Piece } from "./data";

// Общий язык P31: метки — цветные моноширинные чипы по типу, легенда «Имя → Персона_Женщина_7f3a», переключатель
// «Показать оригинал» подставляет значения на месте меток, полоса «Вы → Защита данных → модель». Один и тот же блок
// в панели ответа, в предпросмотре поля ввода и в песочнице настроек.

export const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";
export const ENTER = `animate-in fade-in slide-in-from-bottom-1 duration-200 ${EASE} motion-reduce:slide-in-from-bottom-0`;
export const PRESS = "transition-transform duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100";

export const KINDS: Record<Kind, { label: string; icon: LucideIcon; chip: string; icon_: string }> = {
  account: {
    chip: "bg-teal-500/12 text-teal-700 dark:bg-teal-400/12 dark:text-teal-300",
    icon: Landmark,
    icon_: "text-teal-600 dark:text-teal-400",
    label: "Счёт",
  },
  address: {
    chip: "bg-rose-500/12 text-rose-700 dark:bg-rose-400/12 dark:text-rose-300",
    icon: MapPin,
    icon_: "text-rose-600 dark:text-rose-400",
    label: "Адрес",
  },
  document: {
    chip: "bg-emerald-500/12 text-emerald-700 dark:bg-emerald-400/12 dark:text-emerald-300",
    icon: IdCard,
    icon_: "text-emerald-600 dark:text-emerald-400",
    label: "Документ",
  },
  email: {
    chip: "bg-violet-500/12 text-violet-700 dark:bg-violet-400/14 dark:text-violet-300",
    icon: AtSign,
    icon_: "text-violet-600 dark:text-violet-400",
    label: "Почта",
  },
  org: {
    chip: "bg-muted text-foreground",
    icon: Building2,
    icon_: "text-muted-foreground",
    label: "Организация",
  },
  person: {
    chip: "bg-sky-500/12 text-sky-700 dark:bg-sky-400/14 dark:text-sky-300",
    icon: UserRound,
    icon_: "text-sky-600 dark:text-sky-400",
    label: "Имя",
  },
  phone: {
    chip: "bg-amber-500/14 text-amber-800 dark:bg-amber-400/14 dark:text-amber-300",
    icon: Phone,
    icon_: "text-amber-600 dark:text-amber-400",
    label: "Телефон",
  },
};

/** Подсказки чата: фон боковой панели, без стрелки. */
export const Tip = ({ children }: { children: ReactNode }) => (
  <TooltipContent arrow={false} className="bg-sidebar text-foreground ring-foreground/10 shadow-md ring-1" sideOffset={6}>
    {children}
  </TooltipContent>
);

/** Одна метка: в моноширинном чипе — как её получила модель; с «оригиналом» — значение тем же цветом. */
export const Chip = ({ piece, original }: { piece: Hidden; original: boolean }) => (
  <span
    className={cn(
      "box-decoration-clone rounded-[5px] px-1 py-px",
      KINDS[piece.kind].chip,
      !original && "font-mono text-[0.86em] tracking-tight"
    )}
    title={original ? piece.masked : piece.original}
  >
    {/* Смена вида — короткий вход нового текста на месте: без сдвига строки по вертикали. */}
    <span className={cn("animate-in fade-in zoom-in-[0.97] duration-200", EASE)} key={original ? "o" : "m"}>
      {original ? piece.original : piece.masked}
    </span>
  </span>
);

/** Текст с метками. */
export const MaskedText = ({ pieces, original, className }: { pieces: Piece[]; original: boolean; className?: string }) => (
  <p className={cn("leading-7 whitespace-pre-wrap", className)}>
    {pieces.map((p, i) =>
      typeof p === "string" ? (
        // oxlint-disable-next-line react/no-array-index-key -- куски текста не переставляются
        <span key={i}>{p}</span>
      ) : (
        // oxlint-disable-next-line react/no-array-index-key -- та же метка встречается несколько раз
        <Chip key={i} original={original} piece={p} />
      )
    )}
  </p>
);

/** Легенда: тип, его метка в начальной форме. */
export const Legend = ({ pieces, className }: { pieces: Piece[]; className?: string }) => {
  const hidden = uniqueHidden(pieces);
  if (hidden.length === 0) return null;
  return (
    <ul className={cn("grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-x-4 gap-y-2.5", className)}>
      {hidden.map((h) => {
        const { icon: Icon, label, icon_ } = KINDS[h.kind];
        return (
          <li className="flex min-w-0 flex-col gap-0.5" key={h.id} title={h.original}>
            <span className="flex items-center gap-1.5 text-sm">
              <Icon className={cn("size-3.5 shrink-0", icon_)} />
              {label}
            </span>
            <span className={cn("truncate pl-5 font-mono text-xs", icon_)}>{h.id}</span>
          </li>
        );
      })}
    </ul>
  );
};

/** «Показать оригинал». */
export const OriginalSwitch = ({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) => (
  <label className="text-muted-foreground flex cursor-pointer items-center gap-2 text-sm select-none">
    Показать оригинал
    <Switch checked={on} onCheckedChange={onChange} size="sm" />
  </label>
);

/** «Вы → Защита данных → модель». Пока идёт поток — по линиям бежит точка. Для локальной — без защиты. */
export const Flow = ({ model, live = false }: { model: Model; live?: boolean }) => {
  const line = (
    <span className="bg-border relative h-px min-w-6 flex-1 overflow-hidden">
      {live && (
        <span className="bg-foreground/60 absolute top-1/2 left-0 size-1 -translate-y-1/2 rounded-full motion-safe:animate-[p31-run_1.4s_linear_infinite]" />
      )}
    </span>
  );
  return (
    <div className="text-muted-foreground flex min-w-0 items-center gap-2 text-sm">
      <style>{"@keyframes p31-run { from { left: -4px } to { left: 100% } }"}</style>
      <span className="bg-foreground/8 grid size-5 shrink-0 place-items-center rounded-full">
        <UserRound className="size-3" />
      </span>
      <span className="text-foreground shrink-0">Вы</span>
      {line}
      {model.local ? (
        <>
          <Server className="size-3.5 shrink-0" />
          <span className="shrink-0">Сервер Metobe</span>
        </>
      ) : (
        <>
          <ShieldCheck className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="shrink-0">Защита данных</span>
        </>
      )}
      {line}
      <Sparkle className="size-3.5 shrink-0 text-orange-500" />
      <span className="text-foreground min-w-0 truncate">{model.name}</span>
    </div>
  );
};

/** Строка вложения: файлы шлюз не маскирует, так и пишем. */
export const AttachmentLine = ({ name, sent }: { name: string; sent: boolean }) => (
  <p className="text-muted-foreground flex min-w-0 items-center gap-2 text-sm">
    <Paperclip className="size-3.5 shrink-0" />
    <span className="text-foreground min-w-0 truncate">{name}</span>
    <span className="shrink-0">· {sent ? "ушло без маскирования" : "уходит без маскирования"}</span>
  </p>
);

/** Блок текста: светлая подложка, как «Safe prompt» в образце. */
export const Well = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn("bg-muted/60 dark:bg-muted/40 rounded-xl px-3.5 py-2.5 text-sm", className)}>{children}</div>
);

export const RestoredBadge = () => (
  <Badge size="lg" variant="success-light">
    <CircleCheck />
    Восстановлено
  </Badge>
);

export const LocalNote = () => (
  <p className="text-muted-foreground flex items-center gap-2 text-sm">
    <Server className="size-3.5 shrink-0" />
    Не покидает сервер: локальная модель получает текст как есть
  </p>
);

/** Подпись блока: слева что это, справа — действие. */
export const BlockHead = ({ children, action }: { children: ReactNode; action?: ReactNode }) => (
  <div className="flex min-h-6 items-center justify-between gap-3">
    <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-sm">{children}</span>
    {action}
  </div>
);

/** Поток ответа: слово за словом; на метке поток стоит, пока шлюз держит хвост, — тогда строка «Восстанавливаю данные». */
export const useStream = (pieces: Piece[], run: boolean) => {
  type Step = { piece: number; words: number; hold: boolean };
  const steps: Step[] = [];
  pieces.forEach((p, i) => {
    if (typeof p === "string") {
      const words = p.split(/(?<=\s)/u).length;
      for (let w = 1; w <= words; w += 1) steps.push({ hold: false, piece: i, words: w });
    } else {
      steps.push({ hold: true, piece: i, words: 0 }, { hold: false, piece: i, words: 1 });
    }
  });
  const [at, setAt] = useState(run ? 0 : steps.length - 1);
  const total = steps.length;
  useEffect(() => {
    if (!run) return;
    const step = steps[at];
    let wait = 55;
    if (step?.hold) wait = 650;
    if (at >= total - 1) wait = 2200;
    const t = setTimeout(() => setAt((a) => (a >= total - 1 ? 0 : a + 1)), wait);
    return () => clearTimeout(t);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- шаги строятся из тех же кусков
  }, [at, run, total]);
  const step = steps[Math.min(at, total - 1)] as Step;
  const shown: Piece[] = pieces.slice(0, step.piece);
  const cur = pieces[step.piece];
  if (typeof cur === "string") shown.push(cur.split(/(?<=\s)/u).slice(0, step.words).join(""));
  else if (cur && !step.hold) shown.push(cur);
  return { done: !run || at >= total - 1, holding: run && step.hold, shown };
};

/** «Скрыто 4» — значок щита с числом. */
export const ShieldCount = ({ count, className }: { count: number; className?: string }) => (
  <span className={cn("inline-flex items-center gap-1", className)}>
    <ShieldCheck className="size-3.5" />
    <span className="tabular-nums">{count}</span>
  </span>
);
