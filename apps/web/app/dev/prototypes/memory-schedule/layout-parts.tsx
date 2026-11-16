"use client";

import { cn } from "@metobe/ui/lib/utils";
import { BookUser } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { usePhone } from "../memory/frame";

// Страница «Памяти» прототипа: слева список разделов (на телефоне его нет), справа раздел.

export interface NavItem {
  id: string;
  icon: LucideIcon;
  label: string;
  count?: number;
}

const CARDS = ["Ольга Ли", "Ирина Белова", "Андрей Седов", "Нина Орлова"];

export const MemoryPage = ({ nav, active, onPick, title, note, children }: { nav: NavItem[]; active: string; onPick?: (id: string) => void; title: string; note: string; children: React.ReactNode }) => {
  const phone = usePhone();
  return (
    <div className="flex min-h-full">
      {!phone && (
        <nav className="flex w-56 shrink-0 flex-col gap-0.5 border-r p-2 text-sm">
          {nav.map(({ id, icon: Icon, label, count }) => (
            <button
              className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-left", id === active ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50", !onPick && "cursor-default")}
              key={id}
              onClick={() => onPick?.(id)}
              type="button"
            >
              <Icon className="size-4" />
              <span className="flex-1">{label}</span>
              {count ? <span className="text-muted-foreground text-xs tabular-nums">{count}</span> : null}
            </button>
          ))}
          <span className="text-muted-foreground px-2 pt-3 pb-1 text-xs">Люди и проекты</span>
          {CARDS.map((c) => (
            <span className="text-muted-foreground flex items-center gap-2 rounded-md px-2 py-1.5" key={c}>
              <BookUser className="size-4" />
              {c}
            </span>
          ))}
        </nav>
      )}
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 @lg:px-8 @lg:pt-20">
        <header className="flex flex-col gap-1">
          {!phone && <h2 className="text-lg font-semibold">{title}</h2>}
          <p className="text-muted-foreground text-xs">{note}</p>
        </header>
        {children}
      </div>
    </div>
  );
};

export const Group = ({ title, children, count }: { title: string; count: number; children: React.ReactNode }) =>
  count > 0 ? (
    <section className="flex flex-col gap-1">
      <h3 className="text-muted-foreground text-xs font-medium">
        {title} <span className="tabular-nums">{count}</span>
      </h3>
      <ul className="flex flex-col">{children}</ul>
    </section>
  ) : null;
