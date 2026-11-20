"use client";

import { Picker } from "../_shared/picker";
import { Params, ProtoProvider } from "../memory/frame";
import { Lines, Slots, Summary } from "./scene";

// P35 · раздел администратора «Песочница» (D47): было — только чтение и пределы в `.env`; стало — выключатель,
// пределы правятся здесь, у занятой песочницы «Погасить», интернет из песочницы. Три варианта: «Строки», «Места»
// (как поле мест в PlusPortal), «Сводка» (числа сверху, пределы окном). В адресе: `?v=1..3`, ручки
// `svc=ok|runc|down`, `load=none|some|full`, `sz=phone`.

const SandboxAdminPage = () => (
  <ProtoProvider defaults={{ load: "full", svc: "ok" }}>
    <Picker
      params={
        <Params
          rows={[
            ["svc", "сервис", [["ok", "gVisor"], ["runc", "runc"], ["down", "не отвечает"]]],
            ["load", "занято", [["none", "пусто"], ["some", "2 из 4"], ["full", "всё и очередь"]]],
          ]}
        />
      }
      variants={[
        { Component: Lines, name: "Строки" },
        { Component: Slots, name: "Места" },
        { Component: Summary, name: "Сводка" },
      ]}
    />
  </ProtoProvider>
);

export default SandboxAdminPage;
