"use client";

import { Picker } from "../_shared/picker";
import { Mounted, Params, ProtoProvider } from "../memory/frame";
import CalendarView from "./v-calendar";
import Feed from "./v-feed";
import Section from "./v-section";

// P29 (шаг 6 плана памяти): все напоминания в одном месте, повторяющиеся и что бывает с пришедшим. Три ответа на
// вопрос, где они живут:
//   1 «Раздел» — пункт «Напоминания» в списке «Памяти»; группы: пришли и не отмечены, сегодня, завтра, на неделе,
//     позже, повторяются;
//   2 «В календаре» — четвёртый вид календаря, 14 дней, повтор развёрнут по дням;
//   3 «Лента» — одна страница, один список по времени, пришедшее остаётся на месте; «Все / Разовые / Повторяются».
// Во всех: окно «Строки» со строкой «Повторять» (каждый день, по будням, каждую неделю, месяц, год); «Готово» у
// повтора не закрывает его, а переносит на следующий раз; «Через час» и «Завтра» — как кнопки в Telegram.
// Ручки: после отправки простое напоминание (без второй стороны) закрывается само или ждёт «Готово»; напоминаний
// нет. Телефон — sz=phone. В адресе: `?v=3&close=wait`.

const MemoryRemindersPage = () => (
  <ProtoProvider defaults={{ close: "self", list: "some" }}>
    <Picker
      params={
        <Params
          rows={[
            [
              "close",
              "после отправки",
              [
                ["self", "закрывается само"],
                ["wait", "ждёт «Готово»"],
              ],
            ],
            [
              "list",
              "напоминания",
              [
                ["some", "есть"],
                ["none", "нет"],
              ],
            ],
          ]}
        />
      }
      variants={[
        { Component: () => <Mounted><Section /></Mounted>, name: "Раздел", pickerTop: true },
        { Component: () => <Mounted><CalendarView /></Mounted>, name: "В календаре", pickerTop: true },
        { Component: () => <Mounted><Feed /></Mounted>, name: "Лента", pickerTop: true },
      ]}
    />
  </ProtoProvider>
);

export default MemoryRemindersPage;
