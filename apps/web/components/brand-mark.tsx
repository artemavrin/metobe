import { cn } from "@metobe/ui/lib/utils";

/**
 * The Metobe symbol: a block with two arched openings — an m in negative space, a viaduct: infrastructure that is
 * yours and carries the traffic. Sized in em, so next to the name it follows the font size; filled with currentColor,
 * the theme's primary by default (its lighter step in the dark theme, where primary sinks into the background).
 * The app icon (app/icon.svg) is the same building grown to the whole tile.
 */
export const BrandMark = ({ className }: { className?: string }) => (
  <svg
    aria-hidden
    className={cn(
      "text-primary dark:text-sidebar-primary h-[0.9em] w-auto shrink-0",
      className
    )}
    viewBox="2 4 20 16"
  >
    <path
      d="M3 4h18a1 1 0 0 1 1 1v15H2V5a1 1 0 0 1 1-1ZM6.25 20V9.5a2 2 0 0 1 4 0V20Zm7.5 0V9.5a2 2 0 0 1 4 0V20Z"
      fill="currentColor"
      fillRule="evenodd"
    />
  </svg>
);
