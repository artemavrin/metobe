import type { FilePreview } from "@metobe/contracts/files";

import type { ViewedFile } from "@/components/chat/file-viewer";

// Нейтральные примеры: выручка по месяцам, отчёт, презентация (feedback: никаких клиентов и имён).

export const FILES: ViewedFile[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    kind: "sheet",
    mediaType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    name: "выручка-по-месяцам.xlsx",
    size: 18_432,
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    kind: "doc",
    mediaType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    name: "итоги-квартала.docx",
    size: 24_120,
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    kind: "other",
    mediaType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    name: "обзор.pptx",
    size: 412_000,
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    kind: "text",
    mediaType: "text/markdown",
    name: "выводы.md",
    size: 1840,
  },
];

const months = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь"];

const PREVIEWS: Record<string, FilePreview> = {
  "00000000-0000-4000-8000-000000000001": {
    cut: false,
    sheets: [
      {
        name: "Итоги",
        rows: [
          ["Месяц", "Выручка", "Заказы", "Средний чек", "Доля"],
          ...months.map((m, i) => [
            m,
            String(120_000 + i * 17_500),
            String(310 + i * 22),
            String(Math.round((120_000 + i * 17_500) / (310 + i * 22))),
            `${(12 + i * 1.5).toFixed(1)} %`,
          ]),
        ],
      },
      {
        name: "Исходные",
        rows: [
          ["Дата", "Сумма"],
          ...Array.from({ length: 40 }, (_, i) => [
            `2026-0${(i % 6) + 1}-${String((i % 27) + 1).padStart(2, "0")}`,
            String(1500 + ((i * 731) % 9000)),
          ]),
        ],
      },
    ],
    type: "sheet",
  },
  "00000000-0000-4000-8000-000000000002": {
    html: "<h1>Итоги квартала</h1><p>Выручка выросла на 18 % к прошлому кварталу; заказов стало больше на 21 %.</p><h2>Что сработало</h2><ul><li>Повторные заказы</li><li>Новый способ доставки</li></ul><table><tr><th>Месяц</th><th>Выручка</th></tr><tr><td>Апрель</td><td>172 500</td></tr><tr><td>Май</td><td>190 000</td></tr></table>",
    type: "html",
  },
  "00000000-0000-4000-8000-000000000004": {
    cut: false,
    markdown: true,
    text: "# Выводы\n\n- Рост держится шесть месяцев подряд.\n- Средний чек почти не меняется: растёт число заказов.\n\n**Дальше:** проверить сезонность на данных прошлого года.",
    type: "text",
  },
};

export const loadMock = async (file: ViewedFile) => {
  await new Promise((resolve) => setTimeout(resolve, 400));
  return PREVIEWS[file.id] ?? { type: "none" as const };
};

export const CODE = `import pandas as pd

df = pd.read_csv("/workspace/in/продажи.csv", parse_dates=["Дата"])
by_month = df.groupby(df["Дата"].dt.to_period("M"))["Сумма"].agg(["sum", "count"])
by_month.to_excel("выручка-по-месяцам.xlsx")
print(by_month.tail(3))`;

export const OUTPUT = `           sum  count
Дата
2026-04  172500    376
2026-05  190000    398
2026-06  207500    420`;
