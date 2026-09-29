"use client";

import { cn } from "@metobe/ui/lib/utils";
import { SquarePen } from "lucide-react";

import { useProto } from "./state";

// Сцена: то, среди чего живёт меню — плавающая боковая панель чата с историей, справа сам чат. На телефоне панель
// выезжает поверх страницы, поэтому кадр 390 px с открытой панелью. Панель может быть свёрнута до одних значков.

const CHATS = [
  { group: "Сегодня", items: ["Сверка актов с контрагентами", "Письмо поставщику о сроках"] },
  { group: "Вчера", items: ["Разбор договора аренды", "План отпусков на осень"] },
  { group: "На этой неделе", items: ["Сводка по расходам за август", "Черновик приказа"] },
];

const Brand = ({ collapsed }: { collapsed: boolean }) => (
  <span className="flex items-center gap-2 text-sm font-semibold">
    <span className="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-md text-xs">
      M
    </span>
    {!collapsed && "Metobe"}
  </span>
);

const Sidebar = ({ footer, collapsed }: { footer: React.ReactNode; collapsed: boolean }) => (
  <aside
    className={cn(
      "bg-sidebar text-sidebar-foreground ring-sidebar-border flex shrink-0 flex-col rounded-lg shadow-sm ring-1",
      collapsed ? "w-14" : "w-64"
    )}
  >
    <div className="flex flex-col gap-1 p-2">
      <div className="flex h-8 items-center px-1.5">
        <Brand collapsed={collapsed} />
      </div>
      <div className="hover:bg-sidebar-accent flex h-8 items-center gap-2 rounded-md px-2 text-sm">
        <SquarePen className="size-4 shrink-0" />
        {!collapsed && "Новый чат"}
      </div>
    </div>
    <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2">
      {!collapsed &&
        CHATS.map((g) => (
          <div className="py-1" key={g.group}>
            <div className="text-sidebar-foreground/60 px-2 py-1.5 text-xs font-medium">{g.group}</div>
            {g.items.map((c, i) => (
              <div
                className={cn(
                  "truncate rounded-md px-2 py-1.5 text-sm",
                  g.group === "Сегодня" && i === 0 && "bg-sidebar-accent"
                )}
                key={c}
              >
                {c}
              </div>
            ))}
          </div>
        ))}
    </div>
    <div className={cn("p-2", collapsed && "flex justify-center")}>{footer}</div>
  </aside>
);

const Thread = () => (
  <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 p-6">
    <div className="text-muted-foreground w-full max-w-md space-y-3 text-sm">
      <div className="bg-muted ml-auto w-fit max-w-[80%] rounded-2xl px-3 py-2">Сверь акты за август с выпиской банка</div>
      <div className="w-fit max-w-[90%]">Сверил: расхождений две, обе по контрагенту «Север-Логистика».</div>
    </div>
  </div>
);

/** `footer` — строка-триггер меню; она стоит внизу панели, как в приложении. */
export const Stage = ({ footer }: { footer: (p: { collapsed: boolean; phone: boolean }) => React.ReactNode }) => {
  const { collapsed, phone, last } = useProto();
  const isCollapsed = collapsed && !phone;
  const sidebar = <Sidebar collapsed={isCollapsed} footer={footer({ collapsed: isCollapsed, phone })} />;
  return (
    <div className={cn("bg-background relative flex h-dvh items-center justify-center overflow-hidden p-3", phone && "pb-20")}>
      {phone ? (
        // Кадр телефона: свой position: relative, чтобы шторка меню жила внутри него.
        <div className="ring-border bg-background relative flex h-[760px] max-h-[calc(100dvh-7rem)] w-[390px] overflow-hidden rounded-[2rem] ring-1" data-phone-frame>
          <Thread />
          <div className="absolute inset-0 bg-black/30" />
          <div className="absolute inset-y-2 left-2 flex">{sidebar}</div>
        </div>
      ) : (
        <div className="flex size-full gap-3">
          {sidebar}
          <Thread />
        </div>
      )}
      {last && (
        <div className="bg-foreground text-background absolute bottom-20 left-1/2 -translate-x-1/2 rounded-full px-3 py-1.5 text-xs">
          Откроется: {last}
        </div>
      )}
    </div>
  );
};
