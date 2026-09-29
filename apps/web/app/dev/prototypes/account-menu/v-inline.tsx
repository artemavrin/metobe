"use client";

import { ChartColumn, Languages, LogOut, Plug, Settings } from "lucide-react";

import { LangButtons, MenuHost, MenuRow, Sep, ThemeButtons, TriggerFace, Who } from "./parts";
import { useProto } from "./state";

// «В одну строку»: подменю нет вовсе. Тема и язык лежат рядом двумя пилюлями в одной строке — оба выбора видны и
// меняются одним нажатием, меню при этом остаётся открытым. Ниже — настройки, подключения и расходы, и выход.

export const InlineMenu = ({ collapsed, phone }: { collapsed: boolean; phone: boolean }) => {
  const { go } = useProto();
  return (
    <MenuHost collapsed={collapsed} face={<TriggerFace collapsed={collapsed && !phone} sub="email" />} phone={phone}>
      {(close) => (
        <>
          <div className="flex items-center gap-2.5 px-2 py-2">
            <Who sub="email" />
          </div>
          <Sep />
          <div className="flex items-center justify-between gap-2 px-2 py-1.5">
            <ThemeButtons />
            <div className="flex items-center gap-1.5">
              <Languages className="text-muted-foreground size-4" />
              <LangButtons />
            </div>
          </div>
          <Sep />
          <MenuRow
            end="⌘,"
            icon={Settings}
            onClick={() => {
              go("/settings/account");
              close();
            }}
          >
            Настройки
          </MenuRow>
          <MenuRow
            icon={Plug}
            onClick={() => {
              go("/settings/connections");
              close();
            }}
          >
            Подключения
          </MenuRow>
          <MenuRow
            icon={ChartColumn}
            onClick={() => {
              go("/settings/usage");
              close();
            }}
          >
            Расходы
          </MenuRow>
          <Sep />
          <MenuRow
            icon={LogOut}
            onClick={() => {
              go("выход из аккаунта");
              close();
            }}
          >
            Выйти
          </MenuRow>
        </>
      )}
    </MenuHost>
  );
};
