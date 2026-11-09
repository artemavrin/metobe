"use client";

import { Picker } from "../_shared/picker";
import { Mounted, Params, ProtoProvider } from "../memory/frame";
import { Accent, Plate, PlatePointer, PlateToast } from "./variants";

// P18 · раунд 2: выбрана «Строка» (раунд 1 — ./round-1), теперь — как её не упустить. В адресе:
// `?v=1&q=who|many|done&at=now|late&field=empty|typing&after=no|yes&toast=show|choices&tone=plain|invert&sz=phone`.

const MemoryAskPrototypePage = () => (
  <ProtoProvider defaults={{ after: "no", at: "now", field: "empty", q: "who", toast: "show", tone: "plain" }}>
    <Picker
      params={
        <Params
          rows={[
            ["q", "вопрос", [["who", "какой Андрей"], ["many", "три Ольги"], ["done", "выполнено?"]]],
            ["at", "пришёл", [["now", "сразу"], ["late", "через 3 с"]]],
            ["after", "чат дальше", [["no", "нет"], ["yes", "ещё ответ"]]],
            ["field", "в поле", [["empty", "пусто"], ["typing", "пишет"]]],
            ["toast", "в тосте", [["show", "«Показать»"], ["choices", "варианты"]]],
            ["tone", "тост", [["plain", "обычный"], ["invert", "инверсный"]]],
          ]}
        />
      }
      variants={[
        { Component: () => <Mounted><Accent /></Mounted>, name: "Акцент", pickerTop: true },
        { Component: () => <Mounted><Plate /></Mounted>, name: "Плашка", pickerTop: true },
        { Component: () => <Mounted><PlatePointer /></Mounted>, name: "Плашка и указатель", pickerTop: true },
        { Component: () => <Mounted><PlateToast /></Mounted>, name: "Плашка и тост", pickerTop: true },
      ]}
    />
  </ProtoProvider>
);

export default MemoryAskPrototypePage;
