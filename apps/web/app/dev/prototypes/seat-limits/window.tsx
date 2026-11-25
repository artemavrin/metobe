"use client";

import { cn } from "@metobe/ui/lib/utils";
import { Menu } from "lucide-react";
import type { ReactNode } from "react";

import { usePhone } from "../privacy/frame";

// Окно настроек для P35 и P37: меню разделов слева, экран справа; на телефоне — кадр 390 px со строкой заголовка
// (в узком окне — во весь экран).

export const SettingsWindow = ({ groups, active, children }: { groups: { title: string; items: string[] }[]; active: string; children: ReactNode }) => {
  const phone = usePhone();
  if (phone) {
    return (
      <div className="bg-muted/40 flex min-h-dvh justify-center py-8 max-sm:py-0">
        <div className="bg-background text-foreground relative flex h-[812px] w-[390px] flex-col overflow-hidden rounded-[2.5rem] border pt-6 shadow-xl max-sm:h-dvh max-sm:w-full max-sm:rounded-none max-sm:border-0 max-sm:pt-0">
          <div className="flex h-12 shrink-0 items-center gap-3 border-b px-4 text-sm font-medium">
            <Menu className="text-muted-foreground size-4" />
            {active}
          </div>
          <div className="@container relative min-h-0 flex-1 overflow-y-auto [scrollbar-width:none]">{children}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="bg-background text-foreground flex h-dvh overflow-hidden">
      <aside className="bg-sidebar text-sidebar-foreground flex w-60 shrink-0 flex-col gap-4 border-r p-2 text-sm">
        {groups.map((g) => (
          <div className="flex flex-col gap-0.5" key={g.title}>
            <span className="text-muted-foreground px-2 pt-2 pb-1 text-xs">{g.title}</span>
            {g.items.map((item) => (
              <span className={cn("rounded-md px-2 py-1.5", item === active ? "bg-sidebar-accent font-medium" : "text-muted-foreground")} key={item}>
                {item}
              </span>
            ))}
          </div>
        ))}
      </aside>
      <main className="@container relative min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
};

