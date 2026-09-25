import { cn } from "@metobe/ui/lib/utils";
import { Network } from "lucide-react";

/** A proxy's mark: the flag of the country it exits in once checked, a network sign before that. */
export const ProxyMark = ({
  flag,
  size = 28,
  className,
}: {
  flag: string | null;
  size?: number;
  className?: string;
}) => (
  <span
    aria-hidden
    className={cn(
      "bg-background inline-flex shrink-0 items-center justify-center rounded-[28%] shadow-[0_0_0_1px_rgba(0,0,0,0.07),0_1px_2px_-1px_rgba(0,0,0,0.08)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.1)]",
      className
    )}
    style={{ height: size, width: size }}
  >
    {flag ? (
      <span style={{ fontSize: size * 0.55, lineHeight: 1 }}>{flag}</span>
    ) : (
      <Network
        className="text-muted-foreground"
        style={{ height: size * 0.5, width: size * 0.5 }}
      />
    )}
  </span>
);
