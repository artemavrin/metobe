"use client";

import { Picker } from "../_shared/picker";
import { Mounted, Params, ProtoProvider } from "../memory/frame";
import { Cards, Instead, Rows } from "./variants";

// P17 · раунд 2: предложения из памяти на экране нового чата (D39). Раунд 1 — ./round-1.
// В адресе: `?v=1&n=5&sz=phone`.

const TodayPrototypePage = () => (
  <ProtoProvider defaults={{ n: "5" }}>
    <Picker
      params={<Params rows={[["n", "предложений", [["0", "нет"], ["3", "3"], ["5", "5"]]]]} />}
      variants={[
        { Component: () => <Mounted><Rows /></Mounted>, name: "Строки", pickerTop: true },
        { Component: () => <Mounted><Cards /></Mounted>, name: "Карточки", pickerTop: true },
        { Component: () => <Mounted><Instead /></Mounted>, name: "Вместо «Начать с»", pickerTop: true },
      ]}
    />
  </ProtoProvider>
);

export default TodayPrototypePage;
