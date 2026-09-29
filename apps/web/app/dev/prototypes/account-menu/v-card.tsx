"use client";

import { Badge } from "@metobe/ui/components/reui/badge";
import { Button } from "@metobe/ui/components/button";
import { Languages, Laptop, LogOut, Settings, WandSparkles } from "lucide-react";

import { PERSON } from "../account/data";
import { UserAvatar } from "@/components/user-avatar";
import { LANGS, MenuHost, THEMES, TriggerFace, useThemeChoice } from "./parts";
import { useProto } from "./state";
import type { Lang } from "./state";

// «Карточка»: меню — маленькая панель. Наверху визитка с крупным аватаром, ролью и почтой; под ней четыре плитки
// (тема и язык переключаются нажатием прямо на плитке, две другие ведут в аккаунт); внизу две кнопки — «Настройки» и
// «Выйти». Занимает больше места, зато всё видно сразу и цели крупные — удобно и пальцем.

const Tile = ({
  icon: Icon,
  title,
  value,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value?: string;
  onClick: () => void;
}) => (
  <button
    className="hover:bg-muted flex min-h-16 flex-col items-start gap-1.5 rounded-lg border p-2.5 text-left outline-hidden focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
    onClick={onClick}
    type="button"
  >
    <Icon className="text-muted-foreground size-4" />
    <span className="flex flex-col leading-tight">
      <span className="text-sm font-medium">{title}</span>
      {value && <span className="text-muted-foreground text-xs">{value}</span>}
    </span>
  </button>
);

export const CardMenu = ({ collapsed, phone }: { collapsed: boolean; phone: boolean }) => {
  const { lang, setLang, go } = useProto();
  const theme = useThemeChoice();
  const at = THEMES.findIndex((t) => t.id === theme.current);
  const next = THEMES[(at + 1) % THEMES.length] ?? THEMES[0];
  const now = THEMES[at] ?? THEMES[2];
  const other = (LANGS.find((l) => l.id !== lang) ?? LANGS[0]).id as Lang;
  return (
    <MenuHost
      collapsed={collapsed}
      face={<TriggerFace collapsed={collapsed && !phone} sub="email" />}
      phone={phone}
      width="w-80"
    >
      {(close) => (
        <div className="flex flex-col gap-2 p-1.5">
          <div className="flex items-center gap-3 p-1">
            <UserAvatar className="size-12 text-base" image={null} name={PERSON.name} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{PERSON.name}</span>
                <Badge size="sm" variant="secondary">
                  {PERSON.role}
                </Badge>
              </div>
              <span className="text-muted-foreground truncate font-mono text-xs">{PERSON.email}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Tile icon={now.icon} onClick={() => theme.set(next.id)} title="Тема" value={now.label} />
            <Tile
              icon={Languages}
              onClick={() => setLang(other)}
              title="Язык"
              value={LANGS.find((l) => l.id === lang)?.label}
            />
            <Tile
              icon={WandSparkles}
              onClick={() => {
                go("/settings/account · Сведения для модели");
                close();
              }}
              title="Сведения для модели"
            />
            <Tile
              icon={Laptop}
              onClick={() => {
                go("/settings/account · Активные сеансы");
                close();
              }}
              title="Активные сеансы"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={() => {
                go("/settings/account");
                close();
              }}
              variant="outline"
            >
              <Settings /> Настройки
            </Button>
            <Button
              onClick={() => {
                go("выход из аккаунта");
                close();
              }}
              variant="ghost"
            >
              <LogOut /> Выйти
            </Button>
          </div>
        </div>
      )}
    </MenuHost>
  );
};
