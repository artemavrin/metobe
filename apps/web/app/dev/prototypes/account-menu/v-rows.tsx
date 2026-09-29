"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@metobe/ui/components/dropdown-menu";
import { Languages, LogOut, Settings } from "lucide-react";

import { LANGS, ThemeButtons, triggerClass, TriggerFace, Who } from "./parts";
import { useProto } from "./state";
import type { Lang } from "./state";

// «Строки»: меню как оно есть — список строк; тема одной пилюлей прямо в строке, язык уходит в подменю. Ничего
// нового для человека и ни одного лишнего нажатия для тех, кто заходит только «в настройки» или «выйти».

export const RowsMenu = ({ collapsed }: { collapsed: boolean; phone: boolean }) => {
  const { lang, setLang, go } = useProto();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<button className={triggerClass(collapsed)} type="button" />}>
        <TriggerFace collapsed={collapsed} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={collapsed ? "end" : "start"} className="w-64" side={collapsed ? "right" : "top"}>
        <div className="flex items-center gap-2.5 px-2 py-2">
          <Who sub="email" />
        </div>
        <DropdownMenuSeparator />
        <div className="flex items-center justify-between gap-3 px-2 py-1.5 text-sm">
          <span>Тема</span>
          <ThemeButtons />
        </div>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Languages /> Язык
            <span className="text-muted-foreground ml-auto text-xs">{LANGS.find((l) => l.id === lang)?.label}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup onValueChange={(v) => setLang(v as Lang)} value={lang}>
              {LANGS.map((l) => (
                <DropdownMenuRadioItem key={l.id} value={l.id}>
                  {l.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => go("/settings/account")}>
          <Settings /> Настройки
          <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => go("выход из аккаунта")}>
          <LogOut /> Выйти
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
