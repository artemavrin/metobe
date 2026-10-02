// Вложения: набор файлов из брифа, лимиты и то, как модель прочтёт файл (D33). Только то, что знает система: имя,
// размер, тип, страницы PDF, превью картинки, состояние загрузки.

export const LIMIT_BYTES = 20 * 1024 * 1024;
export const ACCEPT = ["png", "jpg", "jpeg", "gif", "webp", "pdf", "docx", "xlsx", "csv", "txt", "md", "json"];

export type Kind = "image" | "pdf" | "sheet" | "doc" | "text" | "other";

export type Status = "uploading" | "done" | "error";
export type Problem = "too-big" | "type" | "network";

export interface Item {
  id: string;
  name: string;
  size: number;
  kind: Kind;
  pages?: number;
  /** Картинка: превью — data URL образца или object URL настоящего файла. */
  preview?: string;
  status: Status;
  progress: number;
  problem?: Problem;
  /** Настоящий файл (выбран, перетащен, вставлен) — его можно скачать. */
  file?: File;
}

export const kindOf = (name: string): Kind => {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (["xlsx", "csv"].includes(ext)) return "sheet";
  if (ext === "docx") return "doc";
  if (["txt", "md", "json"].includes(ext)) return "text";
  return "other";
};

export const accepted = (name: string) => ACCEPT.includes(name.split(".").pop()?.toLowerCase() ?? "");

export const fmtSize = (n: number) => {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} МБ`;
  return `${Math.max(1, Math.round(n / 1024))} КБ`;
};

const pagesWord = (n: number) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "страница";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "страницы";
  return "страниц";
};

/** «PDF · 3 страницы · 412 КБ» — вторая строка карточки. */
export const meta = (item: Pick<Item, "kind" | "name" | "size" | "pages">) => {
  const ext = item.name.split(".").pop()?.toUpperCase() ?? "";
  const parts = [ext];
  if (item.pages) parts.push(`${item.pages} ${pagesWord(item.pages)}`);
  parts.push(fmtSize(item.size));
  return parts.join(" · ");
};

export const PROBLEM_TEXT: Record<Problem, string> = {
  network: "Загрузка прервалась",
  "too-big": `Больше ${fmtSize(LIMIT_BYTES)}`,
  type: "Такой тип не поддерживается",
};

// Образец скриншота: терминал с ошибкой — нарисован здесь же, чтобы у картинки было настоящее превью.
const SCREENSHOT = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
<rect width="640" height="400" rx="12" fill="#1e1e22"/>
<rect width="640" height="34" rx="12" fill="#2a2a30"/><rect y="20" width="640" height="14" fill="#2a2a30"/>
<circle cx="22" cy="17" r="6" fill="#ff5f57"/><circle cx="42" cy="17" r="6" fill="#febc2e"/><circle cx="62" cy="17" r="6" fill="#28c840"/>
<g font-family="ui-monospace,Menlo,monospace" font-size="15">
<text x="24" y="74" fill="#9ca3af">$ pnpm build</text>
<text x="24" y="104" fill="#e5e7eb">▲ Next.js 16 — creating an optimized build…</text>
<text x="24" y="146" fill="#f87171">Error: Cannot find module '@/lib/storage'</text>
<text x="24" y="172" fill="#f87171">  at app/api/files/route.ts:4:1</text>
<text x="24" y="214" fill="#9ca3af">Import trace for requested module:</text>
<text x="24" y="240" fill="#9ca3af">  ./app/api/files/route.ts</text>
<text x="24" y="282" fill="#fbbf24">Build failed because of webpack errors</text>
<text x="24" y="330" fill="#9ca3af">$ ▍</text>
</g></svg>`;
export const SCREENSHOT_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(SCREENSHOT)}`;

type Sample = Pick<Item, "name" | "size" | "pages" | "preview">;

/** Пять файлов брифа, в порядке появления. */
export const SAMPLES: Sample[] = [
  { name: "Счёт-фактура 0412.pdf", pages: 3, size: 412 * 1024 },
  { name: "скрин ошибки.png", preview: SCREENSHOT_URL, size: Math.round(1.2 * 1024 * 1024) },
  { name: "Выгрузка продаж Q3.xlsx", size: 88 * 1024 },
  { name: "договор аренды.docx", size: 56 * 1024 },
  { name: "заметки.md", size: 4 * 1024 },
];

/** Ещё три — для «8 файлов». */
export const MORE: Sample[] = [
  { name: "акт сверки сентябрь.pdf", pages: 2, size: 236 * 1024 },
  { name: "схема склада.jpg", preview: SCREENSHOT_URL, size: Math.round(2.4 * 1024 * 1024) },
  { name: "остатки на 01.10.csv", size: 31 * 1024 },
];

/** Проблемные: больше лимита и неподдерживаемый тип. */
export const BAD: Sample[] = [
  { name: "запись созвона.pdf", pages: 212, size: 26 * 1024 * 1024 },
  { name: "видео.mov", size: Math.round(14.8 * 1024 * 1024) },
];

/** Модели из параметров: какая видит картинки, какая нет, о какой неизвестно. */
export const MODELS = {
  no: { label: "qwen3-8b", vision: false },
  unknown: { label: "Своя модель · Ollama", vision: null },
  yes: { label: "claude-haiku-4-5", vision: true },
} as const;
export type ModelKey = keyof typeof MODELS;

/** Пометка у картинки для модели без зрения (D33) — неяркая, не блокирует отправку. */
export const visionNote = (model: ModelKey, slot: boolean): string | null => {
  if (model === "yes") return null;
  if (model === "unknown") return slot ? "Если модель не видит картинок, её опишет модель «Зрение»" : "Неизвестно, видит ли модель картинки";
  return slot ? "Опишет модель «Зрение»" : "Модель не увидит эту картинку";
};
