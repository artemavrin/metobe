import { cn } from "@metobe/ui/lib/utils";

/** Title and the line under it for one step of the pages before an account. */
export const AuthHeading = ({
  title,
  children,
  className,
}: {
  title: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) => (
  <div className={cn("mb-8", className)}>
    <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
    {children && (
      <p className="text-muted-foreground mt-2 leading-relaxed">{children}</p>
    )}
  </div>
);

/** A step's entrance: a short rise, ease-out; steps going back come from the left. */
export const stepEnter = (back = false) =>
  cn(
    "animate-in fade-in fill-mode-both motion-reduce:slide-in-from-left-0 motion-reduce:slide-in-from-right-0 duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
    back ? "slide-in-from-left-4" : "slide-in-from-right-4"
  );
