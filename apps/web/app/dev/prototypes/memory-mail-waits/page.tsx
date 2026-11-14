"use client";

import { Picker } from "../_shared/picker";
import { Mounted, Params, ProtoProvider } from "../memory/frame";
import GroupVariant from "./v-group";
import OfferVariant from "./v-offer";
import RowVariant from "./v-row";

// P24 (Г3.1): письмо без ответа в «Не упустить» и где включается «Память читает эту почту». Три ответа:
//   1 «Строка как все» — строка среди обещаний, переключатель на странице ящика;
//   2 «Отдельно» — подраздел «Ждут ответа по почте», переключатели в настройках памяти списком ящиков;
//   3 «Предложение» — строки как в 1, а пока выключено — предложение включить прямо в «Не упустить».
// Ручки: экран («Не упустить» / настройки), почта включена; телефон — sz=phone. В адресе: `?v=3&mail=off`.

const MemoryMailWaitsPage = () => (
  <ProtoProvider defaults={{ mail: "on", screen: "today" }}>
    <Picker
      params={
        <Params
          rows={[
            [
              "screen",
              "экран",
              [
                ["today", "Не упустить"],
                ["box", "настройки"],
              ],
            ],
            [
              "mail",
              "почта",
              [
                ["on", "включена"],
                ["off", "выключена"],
              ],
            ],
          ]}
        />
      }
      variants={[
        { Component: () => <Mounted><RowVariant /></Mounted>, name: "Строка как все", pickerTop: true },
        { Component: () => <Mounted><GroupVariant /></Mounted>, name: "Отдельно", pickerTop: true },
        { Component: () => <Mounted><OfferVariant /></Mounted>, name: "Предложение", pickerTop: true },
      ]}
    />
  </ProtoProvider>
);

export default MemoryMailWaitsPage;
