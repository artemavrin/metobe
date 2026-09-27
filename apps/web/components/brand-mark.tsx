import { cn } from "@metobe/ui/lib/utils";

/**
 * The Metobe mark: a lowercase m whose second arch stands a step higher than the first — «me → to be». One stroke
 * weight, butt ends, both arches of one radius, on a tile in the brand colour. The same geometry as app/icon.svg and
 * docs/brand; the tile follows the theme's primary.
 */
export const BrandMark = ({ className }: { className?: string }) => (
  <span
    aria-hidden
    className={cn(
      "bg-primary text-primary-foreground inline-flex size-7 shrink-0 items-center justify-center rounded-[27.5%] shadow-[inset_0_1px_0_rgb(255_255_255/0.18)]",
      className
    )}
  >
    <svg className="size-full" fill="none" viewBox="0 0 24 24">
      <path
        d="M5.5 18.25V12.5a3.25 3.25 0 0 1 6.5 0v5.75M12 18.25V10a3.25 3.25 0 0 1 6.5 0v8.25"
        stroke="currentColor"
        strokeWidth={2.25}
      />
    </svg>
  </span>
);
