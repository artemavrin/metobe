"use client";

import { TooltipProvider } from "@metobe/ui/components/tooltip";
import { useEffect, useState } from "react";

import { Picker } from "../_shared/picker";
import { EngineProvider } from "./engine";
import { ProtoParams, ProtoProvider, useProto } from "./state";
import { ComposerVariant } from "./v-composer";
import { ConsequenceVariant } from "./v-consequence";
import { InPlaceVariant } from "./v-inplace";
import { SheetVariant } from "./v-sheet";

// Правка отправленного сообщения вместе с файлами: оставить в ленте на месте («На месте»), унести в композер
// («В композере»), показать последствия («С последствиями») или вынести в крупное окно («Лист»). Общее: текст,
// убрать файл, добавить (скрепка, перетаскивание, ⌘V), отправить — ответ создаётся заново, Esc — отмена.
// «Параметры»: число файлов, длинный текст, сколько шло после сообщения, ошибки, экран.

const Mounted = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? children : null;
};

/** Число файлов, текст и «после» — ключ: их смена начинает сцену заново. */
const Scene = ({ children }: { children: React.ReactNode }) => {
  const { count, long, tail } = useProto();
  return <EngineProvider key={`${count}-${long}-${tail}`}>{children}</EngineProvider>;
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

const EditMessagePrototypePage = () => (
  <ProtoProvider>
    <Picker
      params={<ProtoParams />}
      variants={[
        { Component: of(InPlaceVariant), name: "На месте", pickerTop: true },
        { Component: of(ComposerVariant), name: "В композере", pickerTop: true },
        { Component: of(ConsequenceVariant), name: "С последствиями", pickerTop: true },
        { Component: of(SheetVariant), name: "Лист", pickerTop: true },
      ]}
    />
  </ProtoProvider>
);

export default EditMessagePrototypePage;
