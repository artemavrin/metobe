"use client";

import { Picker } from "../_shared/picker";
import { Params, ProtoProvider } from "../memory/frame";
import Phrase from "./v-phrase";
import Panel from "./v-panel";
import Popover2 from "./v-popover";
import Rows from "./v-rows";

// Окно «Новое обещание / Напоминание / Обещание» в календаре «Память» (P27, правка рабочего окна: оно выглядело
// как форма из подписей и больших кнопок). Четыре ответа на вопрос, чем оно может быть:
//   1 «Строки» — то же модальное окно, но без подписей: значок и значение в каждой строке;
//   2 «У места» — не окно: карточка на месте клика, календарь рядом не затемнён;
//   3 «Панель» — панель справа на всю высоту, а в сетке видно, куда встанет плашка;
//   4 «Фраза» — вместо формы одна строка, значки собираются из того, что набрано.
// Параметры: что открыто (новое обещание, напоминание, правка); телефон — sz=phone. В адресе: `?v=1&mode=promise`.

const MemoryPromiseDialogPage = () => (
  <ProtoProvider defaults={{ mode: "promise" }}>
    <Picker
      params={
        <Params
          rows={[
            [
              "mode",
              "окно",
              [
                ["promise", "новое обещание"],
                ["reminder", "напоминание"],
                ["edit", "правка"],
              ],
            ],
          ]}
        />
      }
      variants={[
        { Component: Rows, name: "Строки" },
        { Component: Popover2, name: "У места" },
        { Component: Panel, name: "Панель" },
        { Component: Phrase, name: "Фраза" },
      ]}
    />
  </ProtoProvider>
);

export default MemoryPromiseDialogPage;
