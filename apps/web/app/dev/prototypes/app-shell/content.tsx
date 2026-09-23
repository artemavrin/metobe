"use client";

// Screens shared by every shell variant, so the variants differ only in the shell around them.
import { Avatar, AvatarFallback } from "@purr/ui/components/avatar";
import { Button } from "@purr/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@purr/ui/components/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@purr/ui/components/empty";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@purr/ui/components/input-group";
import { Badge } from "@purr/ui/components/reui/badge";
import { IconTile } from "@purr/ui/components/reui/icon-tile";
import { ArrowUp, Bot, ChevronDown, LogOut, Moon, Paperclip, Settings, User } from "lucide-react";

import { NO_AUTOFILL, ProviderMark } from "../_p7/shared";
import { ProvidersSettings } from "../providers/settings-sections";
import { CHATS, type SettingsSection, settingsItem, USER, type View } from "./data";

// --- chat -----------------------------------------------------------------------------------------

const Composer = ({ autoFocus }: { autoFocus?: boolean }) => (
  <InputGroup className="bg-background rounded-2xl shadow-xs">
    <InputGroupTextarea {...NO_AUTOFILL} autoFocus={autoFocus} className="min-h-14 text-base md:text-sm" placeholder="Спросите что-нибудь…" />
    <InputGroupAddon align="block-end" className="justify-between">
      <span className="flex items-center gap-1">
        <InputGroupButton aria-label="Прикрепить файл" size="icon-xs" variant="ghost">
          <Paperclip />
        </InputGroupButton>
        <InputGroupButton className="gap-1.5" size="xs" variant="ghost">
          <ProviderMark kind="openai" size="xs" /> GPT-5.2 <ChevronDown className="opacity-50" />
        </InputGroupButton>
      </span>
      <InputGroupButton aria-label="Отправить" className="rounded-full" size="icon-xs" variant="default">
        <ArrowUp />
      </InputGroupButton>
    </InputGroupAddon>
  </InputGroup>
);

export const ChatHome = () => (
  <div className="flex flex-1 flex-col items-center justify-center px-6 pb-[12vh]">
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <h1 className="text-center text-2xl font-semibold tracking-tight">Добрый вечер, {USER.name}</h1>
      <Composer autoFocus />
      <div className="flex flex-wrap justify-center gap-2">
        {["Разобрать документ", "Написать письмо", "Сравнить варианты", "Объяснить код"].map((p) => (
          <Button className="rounded-full" key={p} size="sm" variant="outline">
            {p}
          </Button>
        ))}
      </div>
    </div>
  </div>
);

export const ChatThread = ({ id }: { id: string }) => {
  const chat = CHATS.find((c) => c.id === id);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto flex max-w-2xl flex-col gap-6 text-sm leading-relaxed">
          <div className="bg-muted self-end rounded-2xl rounded-br-sm px-4 py-2.5">{chat?.title}. С чего начать?</div>
          <div className="flex gap-3">
            <ProviderMark kind="openai" size="xs" />
            <div className="flex flex-col gap-2">
              <p>Давайте разобьём задачу на шаги. Сначала соберём исходные данные, затем я предложу план и оценку по времени.</p>
              <p>Пришлите, что уже есть: документы, выгрузки или ссылки — я прочитаю и вернусь с первым вариантом.</p>
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto w-full max-w-2xl px-6 pb-6">
        <Composer />
      </div>
    </div>
  );
};

// --- settings -------------------------------------------------------------------------------------

export const SettingsPage = ({ section }: { section: SettingsSection }) => {
  if (section === "providers") return <ProvidersSettings />;
  const item = settingsItem(section);
  const Icon = item.icon;
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <Empty>
        <EmptyHeader>
          <EmptyMedia>
            <IconTile size="lg" variant="frame">
              <Icon />
            </IconTile>
          </EmptyMedia>
          <EmptyTitle>{item.label}</EmptyTitle>
          <EmptyDescription>{item.hint}. Экран появится на своём этапе, здесь он проверяет место в оболочке.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button size="sm" variant="outline">
            Открыть «{item.label}»
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
};

export const SoonPage = ({ title }: { title: string }) => (
  <div className="flex flex-1 items-center justify-center px-6 py-16">
    <Empty>
      <EmptyHeader>
        <EmptyMedia>
          <IconTile size="lg" variant="frame">
            <Bot />
          </IconTile>
        </EmptyMedia>
        <EmptyTitle className="flex items-center gap-2">
          {title}
          <Badge size="sm" variant="secondary">
            v2
          </Badge>
        </EmptyTitle>
        <EmptyDescription>Фоновые агенты и их результаты появятся во второй версии. Место под них в оболочке уже есть.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  </div>
);

export const Screen = ({ view }: { view: View }) => {
  if (view.kind === "settings") return <SettingsPage section={view.section} />;
  if (view.kind === "agents") return <SoonPage title="Агенты" />;
  if (view.kind === "inbox") return <SoonPage title="Входящие" />;
  return view.id ? <ChatThread id={view.id} /> : <ChatHome />;
};

export const screenTitle = (view: View) => {
  if (view.kind === "settings") return ["Настройки", settingsItem(view.section).label];
  if (view.kind === "agents") return ["Агенты"];
  if (view.kind === "inbox") return ["Входящие"];
  return view.id ? ["Чат", CHATS.find((c) => c.id === view.id)?.title ?? ""] : ["Новый чат"];
};

// --- account menu ---------------------------------------------------------------------------------

export const AccountMenu = ({ trigger, onSettings, side = "top" }: { trigger: React.ReactElement; onSettings: () => void; side?: "top" | "right" | "bottom" }) => (
  <DropdownMenu>
    <DropdownMenuTrigger render={trigger} />
    <DropdownMenuContent align="start" className="w-56" side={side}>
      <DropdownMenuLabel className="flex items-center gap-2">
        <UserAvatar />
        <span className="flex flex-col">
          <span className="text-sm font-medium">{USER.name}</span>
          <span className="text-muted-foreground text-xs font-normal">{USER.email}</span>
        </span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem>
          <User /> Профиль
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onSettings}>
          <Settings /> Настройки <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Moon /> Тёмная тема
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem>
        <LogOut /> Выйти
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

export const UserAvatar = ({ className }: { className?: string }) => (
  <Avatar className={className ?? "size-7"}>
    <AvatarFallback className="bg-primary text-primary-foreground text-[11px]">{USER.initials}</AvatarFallback>
  </Avatar>
);
