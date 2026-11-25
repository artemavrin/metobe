"use client";

import { Picker } from "../_shared/picker";
import { Params, ProtoProvider } from "../memory/frame";
import { Slots, Summary, TabsView } from "./variants";

// P37 · места у владельца (ORGS-PLAN §6, D48): места по тарифам сейчас и на следующий месяц, занято и свободно,
// приглашение на место, повышение (сразу, с доплатой) и понижение (с 1-го) тарифа человеку, доплата видна до
// подтверждения, «Свободных мест нет», использование команды в процентах. Варианты «Сводка», «Места», «Вкладки».
// В адресе: `?v=1..3`, `seats=some|full`, `dec=ok|short`, `tab=seats|people|usage`, `sz=phone`.

const SeatsOwnerPage = () => (
  <ProtoProvider defaults={{ dec: "short", seats: "some", tab: "seats" }}>
    <style>{"@media (max-width: 760px) { .proto-picker { max-width: calc(100vw - 16px); overflow-x: auto; scrollbar-width: none; } }"}</style>
    <Picker
      params={
        <Params
          rows={[
            ["seats", "свободные места", [["some", "есть"], ["full", "нет"]]],
            ["dec", "декабрь", [["ok", "как сейчас"], ["short", "мест меньше, чем занято"]]],
            ["tab", "вкладка", [["seats", "места"], ["people", "люди"], ["usage", "использование"]]],
          ]}
        />
      }
      variants={[
        { Component: Summary, name: "Сводка" },
        { Component: Slots, name: "Места" },
        { Component: TabsView, name: "Вкладки" },
      ]}
    />
  </ProtoProvider>
);

export default SeatsOwnerPage;
