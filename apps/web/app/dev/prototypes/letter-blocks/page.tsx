import { getServiceMail } from "@metobe/core/mail";
import type { LetterBlock } from "@metobe/emails/blocks";
import { taskLetter } from "@metobe/emails/task-letter";
import type { TaskLetterProps } from "@metobe/emails/task-letter";

import { getSettingsViewer } from "@/lib/settings-access";

import { inboxOf } from "../sign-in-letter/inbox";
import { Prototype } from "../sign-in-letter/prototype";
import type { Rendered } from "../sign-in-letter/prototype";

// P14 · блоки письма: всё, из чего бывает итог запуска, как это держит почта (@metobe/emails/blocks). Ответ модели —
// список частей: markdown и виджеты, которые посчитал сервер (show_table, show_metrics, show_chart). Конвертер
// превращает каждую часть в блоки одного словаря, письмо их рисует. В почте нет SVG, canvas и flex: ряд — столбики из
// ячеек, цель и доля — полоса, состав — сегменты, рейтинг — полосы; радар — таблицей и строкой «— в Metobe». Пять
// писем — по группе блоков: текст, таблица, показатели, рейтинги, графики. Ряд по времени — столбиками, столбцы по
// категориям — полосами с подписями. Числа выдуманы для вида.

const BASE = "http://macbook.local:3000/dev/prototypes/task-edit?v=3&task=";
const frame = (id: string, task: TaskLetterProps["task"], heading: string, preview: string, blocks: LetterBlock[]): TaskLetterProps => ({
  blocks,
  button: { href: `${BASE}${id}`, label: "Открыть задачу" },
  heading,
  kind: "result",
  label: "Новый итог",
  locale: "ru",
  off: { href: `${BASE}${id}&notify=off`, label: "Отключить для этой задачи" },
  preview,
  task,
  why: `Письмо пришло, потому что для задачи «${task.name}» включены уведомления на почту.`,
});

const SERIES = [3.9, 4.2, 4.0, 4.4, 4.1, 4.6, 4.5, 4.8];
const norm = (xs: number[]) => {
  const max = Math.max(...xs);
  return xs.map((x) => x / max);
};

const LETTERS: { id: string; name: string; subject: string; props: TaskLetterProps }[] = [
  {
    id: "text",
    name: "Текст",
    props: frame(
      "prices",
      { color: "#008300", meta: "По понедельникам в 8:00 · запуск пн, 30 ноя, 8:00", name: "Новости отрасли" },
      "5 новостей, одна — об изменении тарифов доставки",
      "Перевозчики поднимают тарифы с 1 января.",
      [
        {
          runs: [
            { text: "За неделю — пять новостей. Главная: крупные перевозчики поднимают тарифы на " },
            { b: true, text: "8–12 %" },
            { text: " с 1 января; подробности в " },
            { href: "https://example.ru/tariffs", text: "сообщении ассоциации" },
            { text: "." },
          ],
          type: "p",
        },
        { text: "Тарифы доставки", type: "heading" },
        {
          items: [
            { strong: "Посылки до 5 кг", sub: ["по России: +8 %", "в СНГ: +10 %"], text: "дорожают меньше всего." },
            { strong: "Крупногабарит", text: "до +12 %, и минимальный вес для тарифа поднимают до 30 кг." },
          ],
          ordered: true,
          type: "list",
        },
        { text: "Остальное", type: "heading" },
        {
          items: [
            { text: "Маркетплейсы снижают комиссию для новых продавцов на три месяца." },
            { text: "Таможня продлила упрощённый режим для малых партий до конца 2027 года." },
            { runs: [{ text: "Новый формат накладной: поле " }, { code: true, text: "cargo_class" }, { text: " стало обязательным." }] },
          ],
          ordered: false,
          type: "list",
        },
        { text: "«Повышение затронет в первую очередь межрегиональные отправки» — из сообщения ассоциации перевозчиков.", type: "quote" },
        { text: "cargo_class: standard | oversized | fragile", type: "code" },
        { type: "hr" },
        { runs: [{ i: true, text: "Источники: 5 сайтов, 23 страницы." }], type: "p" },
      ]
    ),
    subject: "Новости отрасли: 5 новостей, одна — о тарифах доставки",
  },
  {
    id: "table",
    name: "Таблица",
    props: frame(
      "sales",
      { color: "#1baf7a", meta: "По будням в 18:00 · запуск пн, 30 ноя, 18:00", name: "Остатки на складе" },
      "8 товаров заканчиваются: хватит меньше чем на неделю",
      "Кабель USB-C 1 м — на 2 дня, адаптер питания — на 3.",
      [
        { text: "Товары, которых при текущих продажах хватит меньше чем на 7 дней:", type: "p" },
        {
          head: ["Товар", "Остаток", "Продажи в день", "Хватит на"],
          more: "Ещё 40 товаров с запасом больше недели — в Metobe.",
          right: [1, 2, 3],
          rows: [
            ["Кабель USB-C 1 м", "46 шт.", "23", "2 дня"],
            ["Адаптер питания 20 Вт", "51 шт.", "17", "3 дня"],
            ["Чехол для планшета", "38 шт.", "9", "4 дня"],
            ["Наушники проводные", "62 шт.", "13", "5 дней"],
            ["Зарядная станция", "24 шт.", "5", "5 дней"],
            ["Держатель в авто", "41 шт.", "7", "6 дней"],
            ["Защитное стекло", "77 шт.", "12", "6 дней"],
            ["Карта памяти 128 ГБ", "33 шт.", "5", "7 дней"],
          ],
          title: "Заканчиваются",
          total: ["Итого 8 товаров", "372 шт.", "91", ""],
          type: "table",
        },
      ]
    ),
    subject: "Остатки на складе: 8 товаров заканчиваются",
  },
  {
    id: "metrics",
    name: "Показатели",
    props: frame(
      "sales",
      { color: "#eda100", meta: "По понедельникам в 9:00 · запуск пн, 30 ноя, 9:00", name: "Продажи за неделю" },
      "Выручка 4,8 млн ₽, +6,7 % к прошлой неделе",
      "34 сделки, план месяца выполнен на 82 %.",
      [
        { bars: norm(SERIES), change: "+6,7 % к прошлой неделе", from: "5 окт", label: "Выручка за неделю", to: "23 ноя", tone: "good", type: "trend", value: "4,8 млн ₽" },
        {
          items: [
            { label: "Закрытых сделок", value: "34" },
            { change: "−4 % к прошлой", label: "Средний чек", tone: "bad", value: "141 тыс. ₽" },
            { label: "Новых клиентов", value: "6" },
          ],
          type: "figures",
        },
        { caption: "план — 20 млн ₽", label: "План месяца", pct: 0.82, type: "progress", value: "16,4 млн ₽ · 82 %" },
        { caption: "Альфа-Опт, Берёзка, ТД Сибирь", label: "Доля трёх крупнейших клиентов", pct: 0.52, type: "progress", value: "52 %" },
        {
          cells: [
            { label: "Мин.", value: "12 тыс. ₽" },
            { label: "Медиана", value: "88 тыс. ₽" },
            { label: "Среднее", value: "141 тыс. ₽" },
            { label: "Макс.", value: "1,2 млн ₽" },
          ],
          label: "Сумма сделки",
          type: "range",
        },
        {
          items: [
            { label: "Сделок", value: "34" },
            { label: "Сумма", value: "4,8 млн ₽" },
            { label: "Среднее", value: "141 тыс. ₽" },
            { label: "Медиана", value: "88 тыс. ₽" },
          ],
          label: "Сводка по сделкам",
          type: "facts",
        },
        { text: "Из результата CRM, 412 строк.", type: "more" },
      ]
    ),
    subject: "Продажи за неделю: выручка 4,8 млн ₽, +6,7 %",
  },
  {
    id: "ratings",
    name: "Рейтинги",
    props: frame(
      "sales",
      { color: "#4a3aa7", meta: "1-го числа в 9:00 · запуск вс, 1 дек, 9:00", name: "Продажи по клиентам" },
      "Ноябрь: 8 клиентов из 47 дали 80 % выручки",
      "Альфа-Опт — 21 млн ₽, Берёзка выросла на 34 %.",
      [
        {
          items: [
            { name: "Альфа-Опт", pct: 1, value: "21 млн ₽" },
            { name: "Берёзка", pct: 0.57, value: "12 млн ₽" },
            { name: "ТД Сибирь", pct: 0.38, value: "8 млн ₽" },
            { name: "Орион", pct: 0.33, value: "7 млн ₽" },
            { name: "Восход", pct: 0.24, value: "5 млн ₽" },
          ],
          label: "Клиенты по выручке",
          type: "bars",
        },
        {
          down: [
            { name: "Орион", value: "−1,8 млн ₽ · −20 %" },
            { name: "Меридиан", value: "−0,9 млн ₽ · −31 %" },
          ],
          label: "Кто вырос и упал: ноябрь к октябрю",
          note: "Выросли 19 клиентов, упали 11; в сумме +3,1 млн ₽.",
          type: "movers",
          up: [
            { name: "Берёзка", value: "+3,0 млн ₽ · +34 %" },
            { name: "Восход", value: "+1,2 млн ₽ · +31 %" },
          ],
        },
        {
          items: [
            { name: "Альфа-Опт", pct: 0.31, value: "31 %" },
            { name: "Берёзка", pct: 0.48, value: "48 %" },
            { name: "ТД Сибирь", pct: 0.6, value: "60 %" },
            { name: "Орион", pct: 0.7, value: "70 %" },
            { name: "Ещё 4", pct: 0.8, value: "80 %" },
          ],
          label: "Парето (ABC)",
          note: "8 клиентов из 47 дают 80 % выручки — группа A. Полосы — накопленная доля.",
          type: "bars",
        },
        {
          items: [
            { name: "Альфа-Опт · 14 ноя", pct: 1, value: "4,4 млн ₽" },
            { name: "Берёзка · 22 ноя", pct: 0.66, value: "2,9 млн ₽" },
          ],
          label: "Выбросы",
          note: "2 сделки заметно крупнее обычных: обычно до 1,2 млн ₽.",
          type: "bars",
        },
        {
          items: [
            { name: "Опт", pct: 0.55, value: "26,4 млн ₽" },
            { name: "Розница", pct: 0.3, value: "14,4 млн ₽" },
            { name: "Интернет-магазин", pct: 0.15, value: "7,2 млн ₽" },
          ],
          label: "Выручка по направлениям",
          type: "stack",
        },
      ]
    ),
    subject: "Продажи по клиентам: 8 из 47 дали 80 % выручки",
  },
  {
    id: "charts",
    name: "Графики",
    props: frame(
      "sales",
      { color: "#2a78d6", meta: "1-го числа в 9:00 · запуск вс, 1 дек, 9:00", name: "Выручка по месяцам" },
      "Ноябрь — 18,6 млн ₽, лучший месяц года",
      "Выручка выросла пятый месяц подряд.",
      [
        { bars: norm([12.1, 13.4, 12.8, 14.0, 13.2, 14.9, 15.6, 16.3, 17.0, 17.8, 18.6]), from: "янв", label: "Выручка по месяцам (площадь)", to: "ноя", type: "columns", value: "18,6 млн ₽" },
        { bars: norm([41, 38, 44, 47, 45, 52, 55]), from: "1 ноя", label: "Заказы по неделям (линия)", to: "29 ноя", type: "columns", value: "55" },
        // Столбцы по категориям — полосами с подписью у каждой: у столбиков подписаны только края.
        {
          items: [
            { name: "Опт", pct: 1, value: "26,4 млн ₽" },
            { name: "Розница", pct: 0.55, value: "14,4 млн ₽" },
            { name: "Интернет-магазин", pct: 0.27, value: "7,2 млн ₽" },
          ],
          label: "Выручка по направлениям (столбцы по категориям)",
          type: "bars",
        },
        {
          items: [
            { name: "Москва", pct: 0.42, value: "7,8 млн ₽" },
            { name: "Санкт-Петербург", pct: 0.21, value: "3,9 млн ₽" },
            { name: "Екатеринбург", pct: 0.12, value: "2,2 млн ₽" },
            { name: "Остальные 14 городов", pct: 0.25, value: "4,7 млн ₽" },
          ],
          label: "Выручка по городам (круговая)",
          type: "stack",
        },
        {
          head: ["Показатель", "Ноябрь", "Октябрь"],
          right: [1, 2],
          rows: [
            ["Скорость доставки", "8,4", "7,9"],
            ["Качество упаковки", "9,1", "9,0"],
            ["Работа поддержки", "7,2", "7,8"],
            ["Цена", "6,8", "6,9"],
          ],
          title: "Оценки клиентов (радар)",
          type: "table",
        },
        { text: "График «Оценки клиентов» — в Metobe.", type: "more" },
        { caption: "план — 20 млн ₽", label: "План ноября (радиальная)", pct: 0.93, type: "progress", value: "93 %" },
        { text: "Линия «План» на графике выручки — в Metobe.", type: "more" },
      ]
    ),
    subject: "Выручка по месяцам: ноябрь — 18,6 млн ₽",
  },
];

const LetterBlocksPage = async () => {
  const [{ user }, mail] = await Promise.all([getSettingsViewer(), getServiceMail()]);
  const rendered = {} as Rendered;
  await Promise.all(
    LETTERS.map(async (l) => {
      const { html, text } = await taskLetter(l.props);
      const one = { html, preview: l.props.preview, subject: l.subject, text };
      rendered[l.id] = { en: one, ru: one };
    })
  );
  return (
    <Prototype
      inbox={user ? await inboxOf(user.email) : []}
      letters={rendered}
      locales={["ru"]}
      sender={{ address: mail?.address ?? "no-reply@metobe.local", name: mail?.name ?? "Metobe" }}
      sentAt={new Date().toISOString()}
      timeZone={null}
      variants={LETTERS.map((l) => ({ id: l.id, name: l.name }))}
    />
  );
};

export default LetterBlocksPage;
