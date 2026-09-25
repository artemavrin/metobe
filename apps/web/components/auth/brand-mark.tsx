import { cn } from "@metobe/ui/lib/utils";

/** Placeholder mark until there is a real logo: the brand colour and the initial. */
export const BrandMark = ({ className }: { className?: string }) => (
  <span
    aria-hidden
    className={cn(
      "bg-primary text-primary-foreground inline-flex size-7 items-center justify-center rounded-lg text-xs font-semibold tracking-tight shadow-[inset_0_1px_0_rgb(255_255_255/0.18)]",
      className
    )}
  >
    M
  </span>
);
