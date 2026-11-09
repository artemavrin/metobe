"use client";

import { Picker } from "../_shared/picker";
import { Mounted, Params, ProtoProvider } from "../memory/frame";
import { AtField, Card, Line } from "./variants";

// P18 · вопрос памяти прямо в чате (ARCH §19, D39). В адресе: `?v=1&q=who|many|done&at=now|late&field=empty|typing&sz=phone`.

const MemoryAskPrototypePage = () => (
  <ProtoProvider defaults={{ at: "now", field: "empty", q: "who" }}>
    <Picker
      params={
        <Params
          rows={[
            ["q", "вопрос", [["who", "какой Андрей"], ["many", "три Ольги"], ["done", "выполнено?"]]],
            ["at", "пришёл", [["now", "сразу"], ["late", "через 3 с"]]],
            ["field", "в поле", [["empty", "пусто"], ["typing", "пишет"]]],
          ]}
        />
      }
      variants={[
        { Component: () => <Mounted><Line /></Mounted>, name: "Строка", pickerTop: true },
        { Component: () => <Mounted><Card /></Mounted>, name: "Карточка", pickerTop: true },
        { Component: () => <Mounted><AtField /></Mounted>, name: "У поля", pickerTop: true },
      ]}
    />
  </ProtoProvider>
);

export default MemoryAskPrototypePage;
