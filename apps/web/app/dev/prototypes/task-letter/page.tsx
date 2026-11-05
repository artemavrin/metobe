import { getServiceMail } from "@metobe/core/mail";
import { taskLetter } from "@metobe/emails/task-letter";
import type { TaskLetterProps } from "@metobe/emails/task-letter";

import { getSettingsViewer } from "@/lib/settings-access";

import { inboxOf } from "../sign-in-letter/inbox";
import { Prototype } from "../sign-in-letter/prototype";
import type { Rendered } from "../sign-in-letter/prototype";

// P14 · письмо от задачи (React Email, @metobe/emails/task-letter). Приходит, только когда задача ждёт человека: новый
// итог, вопрос, действие после сбоя; «нового нет» не приходит никогда. Включается в карточке задачи, для каждой
// своё. Пять писем — три итога разной формы (таблица, список, ключевые цифры вместо виджета), вопрос и сбой — в том же
// почтовом клиенте, что письмо со входом. «Параметры»: компьютер или телефон, светлый или тёмный клиент, письмо или
// его текстовая часть. Задачи и числа — те же, что в /task-results.

const BASE = "http://macbook.local:3000/dev/prototypes/task-edit?v=3&task=";
const why = (name: string) => `Письмо пришло, потому что для задачи «${name}» включены уведомления на почту.`;
const off = (id: string) => ({ href: `${BASE}${id}&notify=off`, label: "Отключить для этой задачи" });

const PRICES = { color: "#4a3aa7", meta: "По понедельникам в 10:00 · запуск пн, 30 ноя, 10:00", name: "Цены конкурентов" };
const MAIL = { color: "#eb6834", meta: "По будням в 9:00 · запуск пн, 30 ноя, 9:00", name: "Письма, которым нужен ответ" };
const SALES = { color: "#eda100", meta: "По понедельникам в 9:00 · запуск пн, 30 ноя, 9:00", name: "Продажи за неделю" };

const LETTERS: { id: string; name: string; subject: string; props: TaskLetterProps }[] = [
  {
    id: "table",
    name: "Итог: таблица",
    props: {
      blocks: [
        { text: "Изменились цены у двух товаров:", type: "p" },
        {
          head: ["Товар", "Сайт", "Было", "Стало"],
          right: [2, 3],
          rows: [
            ["Кофемашина капсульная", "shop-one.ru", "24 990 ₽", "22 490 ₽ (−10 %)"],
            ["Фильтр-кувшин", "shop-two.ru", "1 290 ₽", "1 390 ₽ (+8 %)"],
          ],
          type: "table",
        },
        { text: "Остальные 14 — без изменений.", type: "p" },
      ],
      button: { href: `${BASE}prices`, label: "Открыть задачу" },
      heading: "Цены изменились у 2 товаров из 16",
      kind: "result",
      label: "Новый итог",
      locale: "ru",
      off: off("prices"),
      preview: "Кофемашина капсульная — 22 490 ₽ (−10 %), фильтр-кувшин — 1 390 ₽ (+8 %).",
      task: PRICES,
      why: why(PRICES.name),
    },
    subject: "Цены конкурентов: цены изменились у 2 товаров из 16",
  },
  {
    id: "list",
    name: "Итог: список",
    props: {
      blocks: [
        {
          items: [
            { strong: "Поставщик упаковки", text: "«Счёт за октябрь»: просит подтвердить сумму до пятницы." },
            { strong: "Клиент с сайта", text: "спрашивает, успеете ли доставить в Казань к 5 декабря." },
            { strong: "Бухгалтерия", text: "нужен подписанный акт сверки за квартал." },
          ],
          type: "list",
        },
        { text: "Ещё 11 писем — рассылки и уведомления, ответа не требуют.", type: "p" },
      ],
      button: { href: `${BASE}mail`, label: "Открыть задачу" },
      heading: "Ответа ждут 3 письма",
      kind: "result",
      label: "Новый итог",
      locale: "ru",
      off: off("mail"),
      preview: "Поставщик упаковки, клиент с сайта, бухгалтерия.",
      task: { ...MAIL, meta: "По будням в 9:00 · запуск пт, 27 ноя, 9:00" },
      why: why(MAIL.name),
    },
    subject: "Письма, которым нужен ответ: ответа ждут 3 письма",
  },
  {
    id: "figures",
    name: "Итог: показатели",
    props: {
      blocks: [
        { text: "Неделя 23–29 ноября: выручка выросла, больше половины — опт.", type: "p" },
        {
          items: [
            { change: "+6,7 % к прошлой неделе", label: "Выручка", value: "4,8 млн ₽" },
            { label: "Закрытых сделок", value: "34" },
            { change: "55 % выручки", label: "Опт", value: "2,64 млн ₽" },
          ],
          type: "figures",
        },
      ],
      button: { href: `${BASE}sales`, label: "Открыть задачу" },
      heading: "Выручка 4,8 млн ₽, +6,7 % к прошлой неделе",
      kind: "result",
      label: "Новый итог",
      locale: "ru",
      more: "График выручки и разбивка по направлениям — в Metobe.",
      off: off("sales"),
      preview: "34 сделки, больше половины выручки — опт.",
      task: SALES,
      why: why(SALES.name),
    },
    subject: "Продажи за неделю: выручка 4,8 млн ₽, +6,7 %",
  },
  {
    id: "question",
    name: "Вопрос",
    props: {
      blocks: [
        {
          text: "В CRM у сделок два поля с суммой. Сводка за 23–29 ноября собрана по полю «Сумма». Если нужна сумма с НДС, ответьте — следующие сводки пойдут по ней.",
          type: "p",
        },
      ],
      button: { href: `${BASE}sales`, label: "Ответить" },
      heading: "Какую сумму брать в сводке: «Сумма» или «Сумма с НДС»?",
      kind: "question",
      label: "Вопрос",
      locale: "ru",
      off: off("sales"),
      preview: "Сводка за 23–29 ноября собрана по полю «Сумма».",
      task: SALES,
      why: why(SALES.name),
    },
    subject: "Продажи за неделю: вопрос — какую сумму брать в сводке",
  },
  {
    id: "action",
    name: "Нужно действие",
    props: {
      blocks: [{ text: "Письма за 28–30 ноября не проверены. После входа запуск повторится.", type: "p" }],
      button: { href: `${BASE}mail`, label: "Войти в почту" },
      heading: "Нет доступа к почте: срок входа истёк",
      kind: "action",
      label: "Нужно действие",
      locale: "ru",
      off: off("mail"),
      preview: "Письма за 28–30 ноября не проверены.",
      task: MAIL,
      why: why(MAIL.name),
    },
    subject: "Письма, которым нужен ответ: нет доступа к почте",
  },
];

const TaskLetterPage = async () => {
  const [{ user }, mail] = await Promise.all([getSettingsViewer(), getServiceMail()]);
  const rendered = {} as Rendered;
  await Promise.all(
    LETTERS.map(async (l) => {
      const { html, text } = await taskLetter(l.props);
      rendered[l.id] = { en: { html, preview: l.props.preview, subject: l.subject, text }, ru: { html, preview: l.props.preview, subject: l.subject, text } };
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

export default TaskLetterPage;
