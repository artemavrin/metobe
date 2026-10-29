// D35 · «О системе» — обновление из приложения. The release is real: 0.4.0 as GitHub has it (CHANGELOG.md, 14 Oct),
// seen from a server still on 0.3.0. Made up for the prototype: the server's times, the backups' sizes, how long each
// step took, the answers being written during the update.

export const CURRENT = { installed: "2026-10-07", version: "0.3.0" };

export const NEXT = {
  date: "2026-10-14",
  features: [
    "«Доступ» — what people may connect by themselves, and their mail's default confirmations",
    "«Мои файлы», and drafts nobody sent go after a day",
    "↑ edits the last question, and answers take a vote",
    "⌘K searches chats and settings in the chat's sidebar",
    "a skill is kept whole — pictures the model sees or gets described, scripts it reads but does not run",
    "skills core — import an Agent Skills folder, the organization's and each user's own",
    "skills in the chat — pick one with /, the model loads it when a question needs it",
  ],
  fixes: [
    "a skill marked disable-model-invocation is only the user's to call with /",
    "shortcut hints in this computer's keys, and none on a touch screen",
    "the model palette closes on a phone — a cross where the esc hint was",
    "the small things from the M7 audit — phone prompt, figures in tables, «инструмент»",
    "what the screen audit found — a server deleted in one click, bare 404s, a cut-off menu",
  ],
  /** Migrations in it: an image rollback alone is not enough, the base comes back from the copy too. */
  migrations: 4,
  size: "316 МБ",
  url: "https://github.com/artemavrin/metobe/releases/tag/v0.4.0",
  version: "0.4.0",
};

/** Past updates of this server: the releases are real, the times and durations are not. */
export const HISTORY = [
  { at: "2026-10-07T03:00", by: "ночью, сами", from: "0.2.0", took: "1 мин 04 с", to: "0.3.0" },
  { at: "2026-09-24T18:42", by: "Артём Маврин", from: "0.1.1", took: "52 с", to: "0.2.0" },
  { at: "2026-09-23T21:15", by: "установка", from: null, took: "2 мин 31 с", to: "0.1.1" },
];

export const BACKUPS = [
  { at: "2026-10-07T03:00", size: "41 МБ", version: "0.2.0" },
  { at: "2026-09-24T18:42", size: "12 МБ", version: "0.1.1" },
];

export interface Step {
  key: string;
  title: string;
  /** While it runs. */
  doing: string;
  /** Once done. */
  done: string;
}

export const STEPS: Step[] = [
  { doing: "Скачано 198 из 316 МБ — Metobe пока работает как обычно", done: "316 МБ за 14 с", key: "pull", title: "Скачиваем 0.4.0" },
  { doing: "pg_dump базы…", done: "metobe-0.3.0-2026-10-29.dump · 48 МБ", key: "backup", title: "Копия базы" },
  { doing: "Новые сообщения на паузе, дописываются 2 ответа", done: "Все ответы дописаны", key: "drain", title: "Ждём ответы" },
  { doing: "Около 10 секунд Metobe недоступен", done: "Запущена 0.4.0, применено 4 миграции", key: "restart", title: "Перезапуск" },
  { doing: "Здоровье, версия, вход", done: "Всё работает", key: "check", title: "Проверка" },
];

/** How the update ends when it fails: the step it stops at and what came back. */
export const FAILURE = {
  reason: "После перезапуска /api/health отвечает 503: хранилище файлов не отвечает.",
  restored: "Вернули 0.3.0 и базу из копии. Ничего не потеряно — сообщения после паузы не принимались.",
  step: 4,
};

export const MANUAL = "cd ~/metobe && curl -fsSL https://github.com/artemavrin/metobe/releases/latest/download/install.sh | bash";
