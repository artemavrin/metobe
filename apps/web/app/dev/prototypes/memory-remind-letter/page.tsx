"use client";

import { Picker } from "../_shared/picker";
import { Mounted, Params, ProtoProvider } from "../memory/frame";
import Chat from "./v-chat";
import Inline from "./v-inline";
import Window from "./v-window";

// P23 (Г2.4): «Напомнить» в строке «Не упустить» — готовое напоминание второй стороне. Три ответа на вопрос, где
// появляется черновик и кто его пишет:
//   1 «Через чат» — новый чат с готовой просьбой, письмо пишет модель, отправка — обычное «Отправить письмо?»;
//   2 «На месте» — строка раскрывается в письмо по шаблону, без модели; «Написать в чате» — если нужен другой тон;
//   3 «Окно» — окно в виде «Строк» (как окно обещания в календаре), письмо пишет модель, «Короче» и «Мягче».
// Во всех: кому и с какого ящика, тема, текст, и для самого человека — где и когда обещано (в письмо не попадает).
// Параметры: адрес на карточке есть/нет, почта подключена/нет; телефон — sz=phone. В адресе: `?v=2&addr=no`.

const MemoryRemindLetterPage = () => (
  <ProtoProvider defaults={{ addr: "yes", box: "yes" }}>
    <Picker
      params={
        <Params
          rows={[
            [
              "addr",
              "адрес на карточке",
              [
                ["yes", "есть"],
                ["no", "нет"],
              ],
            ],
            [
              "box",
              "почта",
              [
                ["yes", "подключена"],
                ["no", "нет"],
              ],
            ],
          ]}
        />
      }
      variants={[
        { Component: () => <Mounted><Chat /></Mounted>, name: "Через чат", pickerTop: true },
        { Component: () => <Mounted><Inline /></Mounted>, name: "На месте", pickerTop: true },
        { Component: () => <Mounted><Window /></Mounted>, name: "Окно", pickerTop: true },
      ]}
    />
  </ProtoProvider>
);

export default MemoryRemindLetterPage;
