// App shell prototype data: navigation, chat history, the user. Chat titles are illustrative.
import {
  Bell,
  Bot,
  Boxes,
  Factory,
  HardDrive,
  Info,
  Mail,
  MessageSquare,
  Network,
  Plug,
  Search,
  Server,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";

export type SettingsSection =
  | "providers"
  | "vendors"
  | "models"
  | "proxies"
  | "connections"
  | "skills"
  | "search"
  | "users"
  | "access"
  | "mail"
  | "storage"
  | "about";

export type View = { kind: "chat"; id?: string } | { kind: "agents" } | { kind: "inbox" } | { kind: "settings"; section: SettingsSection };

export const SETTINGS: { title: string; items: { id: SettingsSection; label: string; icon: typeof Server; hint: string }[] }[] = [
  {
    items: [
      { hint: "Кто даёт доступ к моделям: ключи, маршруты, здоровье", icon: Server, id: "providers", label: "Источники" },
      { hint: "Кто сделал модели: названия и логотипы в чате", icon: Factory, id: "vendors", label: "Провайдеры" },
      { hint: "Все модели всех провайдеров: цены, возможности, доступ", icon: Boxes, id: "models", label: "Модели" },
      { hint: "Что через какой прокси ходит", icon: Network, id: "proxies", label: "Прокси" },
    ],
    title: "Модели",
  },
  {
    items: [
      { hint: "MCP-серверы и сервисы для инструментов", icon: Plug, id: "connections", label: "Подключения" },
      { hint: "Готовые инструкции и умения для модели", icon: Sparkles, id: "skills", label: "Скиллы" },
      { hint: "Поиск в интернете для моделей и агентов", icon: Search, id: "search", label: "Поиск" },
    ],
    title: "Инструменты",
  },
  {
    items: [
      { hint: "Приглашения, роли, кто что может", icon: Users, id: "users", label: "Пользователи" },
      { hint: "Кому какие модели и подключения доступны", icon: Shield, id: "access", label: "Доступы" },
    ],
    title: "Команда",
  },
  {
    items: [
      { hint: "SMTP для писем со входом и уведомлений", icon: Mail, id: "mail", label: "Почта" },
      { hint: "Файлы и вложения в S3", icon: HardDrive, id: "storage", label: "Хранилище" },
      { hint: "Версия, обновления, мастер-ключ", icon: Info, id: "about", label: "О системе" },
    ],
    title: "Система",
  },
];

export const settingsItem = (id: SettingsSection) => SETTINGS.flatMap((g) => g.items).find((i) => i.id === id) ?? SETTINGS[0]!.items[0]!;

/** Top-level areas. Agents and inbox are v2 — here to check the shell has room for them. */
export const AREAS = [
  { icon: MessageSquare, id: "chat", label: "Чат" },
  { icon: Bot, id: "agents", label: "Агенты", soon: true },
  { icon: Bell, id: "inbox", label: "Входящие", soon: true },
] as const;

export const CHATS: { id: string; title: string; group: "Сегодня" | "Вчера" | "На этой неделе" | "Раньше" }[] = [
  { group: "Сегодня", id: "c1", title: "План миграции на Postgres 18" },
  { group: "Сегодня", id: "c2", title: "Письмо поставщику про задержку" },
  { group: "Сегодня", id: "c3", title: "Разбор логов nginx за ночь" },
  { group: "Вчера", id: "c4", title: "Сводка продаж за сентябрь" },
  { group: "Вчера", id: "c5", title: "Регулярка для номеров телефонов" },
  { group: "На этой неделе", id: "c6", title: "Идеи для корпоратива" },
  { group: "На этой неделе", id: "c7", title: "Сравнить тарифы S3-хранилищ" },
  { group: "На этой неделе", id: "c8", title: "Перевод договора на английский" },
  { group: "Раньше", id: "c9", title: "Как настроить WireGuard" },
  { group: "Раньше", id: "c10", title: "Рецепт борща на 10 человек" },
  { group: "Раньше", id: "c11", title: "Шаблон ТЗ для подрядчика" },
];

export const CHAT_GROUPS = ["Сегодня", "Вчера", "На этой неделе", "Раньше"] as const;

export const USER = { email: "artem@purr.local", initials: "АМ", name: "Артём", role: "Админ" };
