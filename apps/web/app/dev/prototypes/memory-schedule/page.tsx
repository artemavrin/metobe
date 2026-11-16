"use client";

import { Picker } from "../_shared/picker";
import { Mounted, Params, ProtoProvider } from "../memory/frame";
import OneList from "./v-one";
import Places from "./v-places";
import TabsView from "./v-tabs";

// P30 (D45, этап экранов): после разделения обещаний и расписаний — где человек видит всё, что придёт само
// (напоминания, дни рождения и даты, ритмы встреч), и как выглядит напоминание об обещании. Три ответа:
//   1 «Расписание» — «Напоминания» становятся «Расписанием»: всё одним списком по времени, вид — значком;
//   2 «Вкладки» — «Расписание» с вкладками «Напоминания / Даты / Ритмы», у каждой свой порядок, ритмы полоской;
//   3 «По местам» — обещания с колокольчиком в «Календаре», свои напоминания в «Напоминаниях», даты и ритмы в
//     «Правилах» со строкой «следующий раз».
// Показано только то, что модель D45 знает: время и повтор напоминания, пришло ли; день и повтор даты; период ритма
// и день последней встречи. Ручка: расписание есть / пусто. Телефон — sz=phone. В адресе: `?v=2&list=none`.

const MemorySchedulePage = () => (
  <ProtoProvider defaults={{ list: "some" }}>
    <Picker
      params={
        <Params
          rows={[
            [
              "list",
              "расписание",
              [
                ["some", "есть"],
                ["none", "пусто"],
              ],
            ],
          ]}
        />
      }
      variants={[
        { Component: () => <Mounted><OneList /></Mounted>, name: "Расписание", pickerTop: true },
        { Component: () => <Mounted><TabsView /></Mounted>, name: "Вкладки", pickerTop: true },
        { Component: () => <Mounted><Places /></Mounted>, name: "По местам", pickerTop: true },
      ]}
    />
  </ProtoProvider>
);

export default MemorySchedulePage;
