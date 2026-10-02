"use client";

import { TooltipProvider } from "@metobe/ui/components/tooltip";
import { useEffect, useState } from "react";

import { Picker } from "../_shared/picker";
import { EngineProvider } from "./engine";
import { ProtoParams, ProtoProvider, useProto } from "./state";
import { ChipsVariant } from "./v-chips";
import { DeckVariant } from "./v-deck";
import { ShelfVariant } from "./v-shelf";
import { StackVariant } from "./v-stack";
import { TrayVariant } from "./v-tray";

// Вложения в чате (D33): как файл выглядит в композере и в отправленном сообщении. Второй круг: «Полка» (по референсу —
// чипы над вложенным полем) и «Колода» (стопка за краем поля, веер по наведению); первый — лоток, чипы, стопка. «Параметры»: сколько файлов, модель, «Зрение»,
// сеть, ошибки, экран. Свои файлы — «+» → «Файлы», перетаскиванием или ⌘V.

const Mounted = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? children : null;
};

/** Число файлов и сеть — ключ: их смена начинает сцену заново. */
const Scene = ({ children }: { children: React.ReactNode }) => {
  const { count, breakOne } = useProto();
  return <EngineProvider key={`${count}-${breakOne}`}>{children}</EngineProvider>;
};

const of = (View: () => React.ReactNode) => () => (
  <Mounted>
    <TooltipProvider delay={300}>
      <Scene>
        <View />
      </Scene>
    </TooltipProvider>
  </Mounted>
);

const AttachmentsPrototypePage = () => (
  <ProtoProvider>
    <Picker
      params={<ProtoParams />}
      variants={[
        { Component: of(ShelfVariant), name: "Полка", pickerTop: true },
        { Component: of(DeckVariant), name: "Колода", pickerTop: true },
        { Component: of(TrayVariant), name: "Лоток", pickerTop: true },
        { Component: of(ChipsVariant), name: "Чипы в строке", pickerTop: true },
        { Component: of(StackVariant), name: "Стопка", pickerTop: true },
      ]}
    />
  </ProtoProvider>
);

export default AttachmentsPrototypePage;
