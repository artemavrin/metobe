"use client";

import { Badge } from "@metobe/ui/components/reui/badge";
import { cn } from "@metobe/ui/lib/utils";

import type { Change } from "./data";

// What has no picture: «И ещё» — a line each — and, for an admin, the service's changes under their own heading.

/** A change in one run of text: its name in bold, then what it does — two lines, not three. */
const Line = ({ c }: { c: Change }) => (
  <li className="text-muted-foreground text-sm leading-relaxed">
    <span className="text-foreground font-medium">{c.title}.</span> {c.text}
  </li>
);

export const Rest = ({ changes, className }: { changes: Change[]; className?: string }) => {
  const more = changes.filter((c) => !c.shot && !c.admin);
  const admin = changes.filter((c) => c.admin);
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {more.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">И ещё</h3>
          <ul className="flex flex-col gap-2">
            {more.map((c) => (
              <Line c={c} key={c.id} />
            ))}
          </ul>
        </section>
      )}
      {admin.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-muted-foreground flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
            Для администратора
            <Badge className="tracking-normal normal-case" size="sm" variant="secondary">
              видите только вы
            </Badge>
          </h3>
          <ul className="flex flex-col gap-2">
            {admin.map((c) => (
              <Line c={c} key={c.id} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};
