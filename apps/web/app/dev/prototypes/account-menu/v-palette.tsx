"use client";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@metobe/ui/components/command";
import { Laptop, LogOut, Settings, WandSparkles } from "lucide-react";

import { LANGS, MenuHost, THEMES, TriggerFace, useThemeChoice, Who } from "./parts";
import { useProto } from "./state";

// «Палитра»: меню как список действий с поиском. Печатаешь «тём» — остаётся «Тёмная»; стрелки и Enter работают, как
// в командной палитре. Тема и язык — обычные пункты с галочкой у текущего; выбор применяется, меню остаётся.

export const PaletteMenu = ({ collapsed, phone }: { collapsed: boolean; phone: boolean }) => {
  const { lang, setLang, go } = useProto();
  const theme = useThemeChoice();
  return (
    <MenuHost
      collapsed={collapsed}
      face={<TriggerFace chevron collapsed={collapsed && !phone} />}
      phone={phone}
      width="w-72"
    >
      {(close) => (
        <Command className="p-0">
          <div className="flex items-center gap-2.5 px-2 pt-2 pb-1.5">
            <Who sub="email" />
          </div>
          <CommandInput placeholder="Найти действие" />
          <CommandList className="max-h-80">
            <CommandEmpty>Ничего не нашлось</CommandEmpty>
            <CommandGroup heading="Аккаунт">
              <CommandItem
                onSelect={() => {
                  go("/settings/account · Сведения для модели");
                  close();
                }}
                value="сведения для модели инструкции"
              >
                <WandSparkles /> Сведения для модели
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  go("/settings/account · Активные сеансы");
                  close();
                }}
                value="активные сеансы устройства"
              >
                <Laptop /> Активные сеансы
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  go("/settings/account");
                  close();
                }}
                value="настройки"
              >
                <Settings /> Настройки
                <CommandShortcut>⌘,</CommandShortcut>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Тема">
              {THEMES.map(({ id, icon: Icon, label }) => (
                <CommandItem
                  data-checked={theme.current === id}
                  key={id}
                  onSelect={() => theme.set(id)}
                  value={`тема ${label}`}
                >
                  <Icon /> {label}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Язык">
              {LANGS.map((l) => (
                <CommandItem
                  data-checked={lang === l.id}
                  key={l.id}
                  onSelect={() => setLang(l.id)}
                  value={`язык ${l.label}`}
                >
                  <span className="text-muted-foreground w-4 text-center text-[10px] font-medium">{l.short}</span>
                  {l.label}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                onSelect={() => {
                  go("выход из аккаунта");
                  close();
                }}
                value="выйти выход"
              >
                <LogOut /> Выйти
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      )}
    </MenuHost>
  );
};
