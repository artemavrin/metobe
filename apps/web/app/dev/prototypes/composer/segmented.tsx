"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import { useLayoutEffect, useRef, useState } from "react";

// A small radio group with a pill that slides to the chosen option: movement on screen, so ease-in-out-ish
// strong curve, 200ms; the first placement is instant. Real radios underneath for keyboard and screen readers.

export type Segment<T extends string> = { id: T; label: React.ReactNode; tip?: React.ReactNode; disabled?: boolean };

export const Segmented = <T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T | null;
  onChange: (v: T) => void;
  options: Segment<T>[];
  label: string;
  className?: string;
}) => {
  const refs = useRef<Record<string, HTMLLabelElement | null>>({});
  const box = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const el = value ? refs.current[value] : null;
    const outer = box.current?.getBoundingClientRect();
    const r = el?.getBoundingClientRect();
    setPill(r && outer ? { w: r.width, x: r.left - outer.left } : null);
    const t = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(t);
  }, [value]);

  return (
    <div aria-label={label} ref={box} className={cn("bg-muted/70 relative inline-flex h-7 items-center rounded-lg p-0.5", className)} role="radiogroup">
      <span
        aria-hidden
        className={cn(
          "bg-background absolute top-0.5 left-0 h-6 rounded-md shadow-xs ring-1 ring-black/5",
          ready && "transition-[transform,width,opacity] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
        )}
        style={{ opacity: pill ? 1 : 0, transform: `translateX(${pill?.x ?? 0}px)`, width: pill?.w ?? 0 }}
      />
      {options.map((o) => {
        const item = (
          <label
            className={cn(
              "relative z-10 flex h-6 cursor-pointer items-center gap-1 rounded-md px-2 text-xs whitespace-nowrap transition-colors duration-150 [&_svg]:size-3.5",
              value === o.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              o.disabled && "pointer-events-none opacity-40",
              "has-focus-visible:ring-ring/50 has-focus-visible:ring-2"
            )}
            key={o.id}
            ref={(el) => {
              refs.current[o.id] = el;
            }}
          >
            <input aria-disabled={o.disabled} checked={value === o.id} className="sr-only" name={label} onChange={() => !o.disabled && onChange(o.id)} type="radio" />
            {o.label}
          </label>
        );
        return o.tip ? (
          <Tooltip key={o.id}>
            <TooltipTrigger render={<span className="relative z-10 inline-flex" />}>{item}</TooltipTrigger>
            <TooltipContent>{o.tip}</TooltipContent>
          </Tooltip>
        ) : (
          item
        );
      })}
    </div>
  );
};
