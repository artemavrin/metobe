import type { ReactNode } from "react";

// Settings rows (P7): label and hint take the free width on the left, the value and its action sit on the right;
// on phones the value moves under the label.

export const Section = ({
  title,
  meta,
  action,
  children,
}: {
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) => (
  <section className="flex flex-col gap-3">
    <div className="flex items-end justify-between gap-3">
      <h2 className="text-sm font-semibold">
        {title}
        {meta && (
          <span className="text-muted-foreground ml-2 font-normal">{meta}</span>
        )}
      </h2>
      {action}
    </div>
    {children}
  </section>
);

export const Rows = ({ children }: { children: ReactNode }) => (
  <div className="divide-y rounded-lg border">{children}</div>
);

export const Row = ({
  label,
  hint,
  children,
  action,
}: {
  label: string;
  hint?: string;
  children?: ReactNode;
  action?: ReactNode;
}) => (
  <div className="flex min-h-14 flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-6">
    <div className="flex min-w-0 flex-1 flex-col">
      <span className="font-medium">{label}</span>
      {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
    </div>
    <div className="flex min-w-0 shrink-0 items-center justify-between gap-3 md:max-w-[60%] md:justify-start">
      <div className="min-w-0 flex-1 md:flex-none">{children}</div>
      {action}
    </div>
  </div>
);
