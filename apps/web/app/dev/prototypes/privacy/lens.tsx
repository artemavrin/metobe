"use client";

import { Button } from "@metobe/ui/components/button";
import { Tooltip, TooltipTrigger } from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import { ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import type { Hidden, Piece } from "./data";
import { EASE, Tip } from "./parts";

// «Взгляд модели» — один значок у каждого сообщения, шага и у поля ввода: щит с числом скрытого. Нажатие показывает
// ровно эту часть обмена так, как она пересекла границу: сообщение — как ушло в модель, шаг — что модель отправила
// в тул и что получила, ответ — как модель его написала. Метки — тихие моноширинные чипы одного цвета: тип читается
// из самой метки, цвет в ленте только у нажатого значка. Наведение на метку показывает исходное значение.

/** Смена текста на месте: новый входит из лёгкого размытия, без сдвига; при «меньше движения» — только проявление. */
export const LENS_CSS = `
@keyframes p31-swap { from { opacity: 0; filter: blur(3px); } }
@keyframes p31-fade { from { opacity: 0; } }
@keyframes p31-line { from { text-decoration-color: transparent; } }
.p31-swap { animation: p31-swap 220ms cubic-bezier(0.23, 1, 0.32, 1) both; }
.p31-line { animation: p31-line 300ms ease both; }
@media (prefers-reduced-motion: reduce) { .p31-swap { animation: p31-fade 150ms ease both; } }
`;

/** Метки входят волной слева направо: вёрстка встаёт сразу, проявление — с шагом 35 мс, не дольше 300 мс на всё. */
const wave = (order: number) => ({ animationDelay: `${Math.min(order, 8) * 35}ms` });

/** Метка, как её получила модель. */
export const Token = ({ piece, order }: { piece: Hidden; order: number }) => (
  <Tooltip>
    <TooltipTrigger
      delay={150}
      render={
        <span
          className="p31-swap bg-foreground/[0.07] text-foreground/80 dark:bg-foreground/10 cursor-default rounded-[5px] box-decoration-clone px-1 py-px font-mono text-[0.86em] leading-none tracking-tight"
          style={wave(order)}
        />
      }
    >
      {piece.masked}
    </TooltipTrigger>
    <Tip>{piece.original}</Tip>
  </Tooltip>
);

/** Текст сообщения: как в чате или как у модели. Переключение меняет только скрытые значения, остальное стоит. */
export const Seen = ({ pieces, lens }: { pieces: Piece[]; lens: boolean }) => {
  // Обычный текст проявляется только на обратном пути — при первом показе страницы имена не мигают.
  const [flipped, setFlipped] = useState(lens);
  if (lens && !flipped) setFlipped(true);
  let order = 0;
  return (
    <>
      {pieces.map((p, i) => {
        // oxlint-disable-next-line react/no-array-index-key -- куски текста не переставляются
        if (typeof p === "string") return <span key={i}>{p}</span>;
        order += 1;
        return lens ? (
          // oxlint-disable-next-line react/no-array-index-key -- та же метка встречается несколько раз
          <Token key={`${i}m`} order={order - 1} piece={p} />
        ) : (
          // oxlint-disable-next-line react/no-array-index-key -- то же
          <span className={cn(flipped && "p31-swap")} key={`${i}o`}>
            {p.original}
          </span>
        );
      })}
    </>
  );
};

/** Значок: щит с числом. Нажат — зелёный и с подписью, что сейчас на экране. */
export const Mark = ({
  count,
  on,
  onToggle,
  tip,
  label,
  icon: Icon = ShieldCheck,
  className,
}: {
  count?: number;
  on: boolean;
  onToggle: () => void;
  /** Подсказка, пока не нажат: что покажет. */
  tip: string;
  /** Подпись рядом, пока нажат: «Так получила модель». */
  label?: string;
  icon?: LucideIcon;
  className?: string;
}) => (
  <Tooltip>
    <TooltipTrigger
      delay={500}
      render={
        <Button
          aria-label={tip}
          aria-pressed={on}
          className={cn(
            "text-muted-foreground hover:text-foreground h-6 shrink-0 gap-1 px-1.5 text-xs font-medium transition-[color,background-color,scale] duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100 [&_svg]:size-3.5",
            on &&
              "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-400",
            className
          )}
          onClick={onToggle}
          size="xs"
          type="button"
          variant="ghost"
        />
      }
    >
      <Icon />
      {/* Нажат с подписью — число не нужно: метки уже на экране. */}
      {on && label ? (
        <span className="p31-swap font-normal whitespace-nowrap">{label}</span>
      ) : (
        count !== undefined && (
          <span className="p31-swap tabular-nums" key={count}>
            {count}
          </span>
        )
      )}
    </TooltipTrigger>
    <Tip>{on ? "Показать как в чате" : tip}</Tip>
  </Tooltip>
);

/** Раскрытие на месте: строки сетки, без замера высоты; закрывается быстрее, чем открывается. */
export const Expand = ({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) => (
  <div
    className={cn(
      "grid transition-[grid-template-rows,opacity] motion-reduce:[transition-property:opacity]",
      EASE,
      open ? "grid-rows-[1fr] opacity-100 duration-250" : "grid-rows-[0fr] opacity-0 duration-150",
      className
    )}
    inert={!open}
  >
    <div className="min-h-0 overflow-hidden">{children}</div>
  </div>
);
