// P35 · данные прототипа «Песочница» в настройках. Только то, что сервис песочницы отдаёт или может отдать
// (`SandboxStatus`): кто занял песочницу, чат это или задача, выполняет ли код, когда погаснет, сколько ждут места.
// Названия чатов и задач сервис не знает и админу их не показываем.

export interface Box {
  id: string;
  person: string;
  kind: "chat" | "task";
  busy: boolean;
  /** Минут с создания. */
  age: number;
  /** Во сколько погаснет без нового ответа; у занятой — нет. */
  until?: string;
}

export type Load = "none" | "some" | "full";

const ALL: Box[] = [
  { age: 3, busy: true, id: "b1", kind: "chat", person: "Анна Смирнова" },
  { age: 12, busy: false, id: "b2", kind: "chat", person: "Игорь Петров", until: "14:27" },
  { age: 1, busy: true, id: "b3", kind: "task", person: "Мария Ким" },
  { age: 6, busy: false, id: "b4", kind: "chat", person: "Дмитрий Орлов", until: "14:31" },
];

export const boxesFor = (load: Load): { boxes: Box[]; waiting: number } => {
  if (load === "none") return { boxes: [], waiting: 0 };
  if (load === "some") return { boxes: ALL.slice(0, 2), waiting: 0 };
  return { boxes: ALL, waiting: 2 };
};

export interface Limits {
  total: number;
  perUser: number;
  idleMin: number;
  memoryMb: number;
  runSeconds: number;
  fileMb: number;
}

/** Как сейчас в `.env` по умолчанию. */
export const DEFAULTS: Limits = { fileMb: 25, idleMin: 5, memoryMb: 1024, perUser: 1, runSeconds: 60, total: 4 };

/** Память сервера (Docker сообщает её сам); на песочницы — не больше трёх четвертей. */
export const HOST_MB = 16_384;

export interface Field {
  key: keyof Limits;
  label: string;
  hint: string;
  unit: string;
  min: number;
  max: (l: Limits) => number;
}

export const FIELDS: Field[] = [
  { hint: "Сверх этого — ждут в очереди, чат раньше задачи", key: "total", label: "Песочниц одновременно", max: () => 32, min: 1, unit: "шт." },
  { hint: "Два чата одного человека — две песочницы", key: "perUser", label: "У одного человека", max: (l) => l.total, min: 1, unit: "шт." },
  { hint: "Файлы чата живут, пока песочница ждёт следующего ответа", key: "idleMin", label: "Ждёт следующего ответа", max: () => 60, min: 1, unit: "мин" },
  { hint: "Памяти больше — больше таблицы, которые модель прочитает", key: "memoryMb", label: "Память песочницы", max: () => 8192, min: 1024, unit: "МБ" },
  { hint: "Дольше — код останавливается", key: "runSeconds", label: "Один запуск кода", max: () => 600, min: 10, unit: "с" },
  { hint: "Больше — модель не отдаст файл в чат", key: "fileMb", label: "Файл из песочницы", max: () => 100, min: 1, unit: "МБ" },
];

export const fieldError = (f: Field, l: Limits): string | null => {
  const v = l[f.key];
  if (!Number.isInteger(v)) return "Нужно целое число";
  if (v < f.min) return `Не меньше ${f.min}`;
  const max = f.max(l);
  if (v > max) return f.key === "perUser" ? `Не больше, чем всего (${max})` : `Не больше ${max}`;
  return null;
};

export const memoryNote = (l: Limits) => {
  const need = l.total * l.memoryMb;
  const gb = (mb: number) => `${Math.round((mb / 1024) * 10) / 10} ГБ`;
  return { over: need > HOST_MB * 0.75, text: `Все песочницы вместе — до ${gb(need)} памяти из ${gb(HOST_MB)} на сервере` };
};

export const SETTINGS_MENU = ["Пользователи", "Модели", "Источники", "Поиск в интернете", "Защита данных", "Песочница", "Хранилище", "О системе"];
