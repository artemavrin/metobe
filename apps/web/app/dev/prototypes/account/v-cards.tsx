"use client";

import { cn } from "@metobe/ui/lib/utils";
import { ChevronDown } from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import type { ReactNode } from "react";

import { SettingsPageFrame } from "@/components/settings/settings-shell";

import { ago } from "./data";
import {
  DangerRows,
  DevicesRows,
  ExportRows,
  Header,
  LookBody,
  ModelBody,
  RegionRows,
  RevokeOthers,
} from "./parts";
import { useAccount } from "./state";

// «Карточки»: under the header, four cards that each say how they stand — the theme, the notes, the devices — and open
// in place, one at a time, into the settings themselves. You see the state without opening anything.

const THEME_NAME: Record<string, string> = {
  dark: "Тёмная",
  light: "Светлая",
  system: "Как в системе",
};

const Card = ({
  id,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  summary: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) => (
  <section
    className={cn(
      "bg-card rounded-xl border transition-[grid-column] duration-200",
      open && "md:col-span-2",
    )}
  >
    <h2>
      <button
        aria-controls={`${id}-body`}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 rounded-xl p-4 text-left transition-colors duration-150 hover:bg-muted/40"
        onClick={onToggle}
        type="button"
      >
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-sm font-semibold">{title}</span>
          <span className="text-muted-foreground line-clamp-2 text-sm font-normal">
            {summary}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
            open && "rotate-180",
          )}
        />
      </button>
    </h2>
    <div
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-250 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
      id={`${id}-body`}
      inert={!open}
    >
      <div className="overflow-hidden">
        <div className="flex flex-col gap-6 border-t p-4">{children}</div>
      </div>
    </div>
  </section>
);

export const Cards = () => {
  const a = useAccount();
  const { theme } = useTheme();
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (id: string) => setOpen((o) => (o === id ? null : id));
  const others = a.sessions.filter((s) => !s.current);
  return (
    <SettingsPageFrame>
      <Header />
      <div className="grid items-start gap-3 md:grid-cols-2">
        <Card
          id="look"
          onToggle={() => toggle("look")}
          open={open === "look"}
          summary={`${THEME_NAME[theme ?? "system"] ?? "Как в системе"} · Русский · Europe/Moscow`}
          title="Внешний вид и язык"
        >
          <LookBody />
          <RegionRows />
        </Card>
        <Card
          id="model"
          onToggle={() => toggle("model")}
          open={open === "model"}
          summary={
            a.notes
              ? `«${a.notes}»`
              : "Не заполнено: модель не получает сведений о вас"
          }
          title="Сведения для модели"
        >
          <ModelBody />
        </Card>
        <Card
          id="devices"
          onToggle={() => toggle("devices")}
          open={open === "devices"}
          summary={
            others.length
              ? `Текущий сеанс и ещё ${others.length} · последний ${ago(others[0]?.ago ?? 0)}`
              : "Только текущий сеанс"
          }
          title="Активные сеансы"
        >
          <DevicesRows />
          <div>
            <RevokeOthers />
          </div>
        </Card>
        <Card
          id="data"
          onToggle={() => toggle("data")}
          open={open === "data"}
          summary="Экспорт одним файлом · удаление чатов · удаление аккаунта"
          title="Данные"
        >
          <ExportRows />
          <DangerRows />
        </Card>
      </div>
    </SettingsPageFrame>
  );
};
