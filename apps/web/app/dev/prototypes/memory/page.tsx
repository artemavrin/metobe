"use client";

import { Picker } from "../_shared/picker";
import { Mounted, Params, ProtoProvider } from "./frame";
import { Cards, Feed, InChat } from "./variants";

// P16 · страница «Память» и строка «Запомнено» под ответом (D39). В адресе: `?v=1&drafts=off&mem=empty&sz=phone`.

const MemoryPrototypePage = () => (
  <ProtoProvider defaults={{ drafts: "on", mem: "full" }}>
    <Picker
      params={
        <Params
          rows={[
            ["drafts", "не записано", [["on", "есть"], ["off", "нет"]]],
            ["mem", "память", [["full", "есть"], ["empty", "пустая"]]],
          ]}
        />
      }
      variants={[
        { Component: () => <Mounted><Cards /></Mounted>, name: "Карточки", pickerTop: true },
        { Component: () => <Mounted><Feed /></Mounted>, name: "Лента", pickerTop: true },
        { Component: () => <Mounted><InChat /></Mounted>, name: "В чате", pickerTop: true },
      ]}
    />
  </ProtoProvider>
);

export default MemoryPrototypePage;
