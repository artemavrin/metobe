"use client";

import { useEffect, useState } from "react";

import { Picker } from "../_shared/picker";
import { RunProvider } from "./run";
import { ProtoParams, ProtoProvider, useProto } from "./state";
import { Line } from "./v-line";
import { Panel } from "./v-panel";
import { Ribbon } from "./v-ribbon";

// P4 · «Активность ответа»: как показать, что модель делает шаг за шагом, и что от этого остаётся. Три устройства
// одного набора шагов (мысли, веб-поиск, чтение страницы, тул MCP, письмо): карточка с лентой шагов, одна строка-статус
// с раскрытием в самом ответе, плашка и боковая панель. «Параметры»: сценарий, экран, скорость; ↻ на пилюле — заново.

/** Только в браузере: тема известна там. */
const Mounted = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? children : null;
};

/** Сценарий и скорость — ключ: смена любого начинает ответ заново. */
const Run = ({ children }: { children: React.ReactNode }) => {
  const { scenarioId, speed } = useProto();
  return <RunProvider key={`${scenarioId}-${speed}`}>{children}</RunProvider>;
};

const of = (View: () => React.ReactNode) => () => (
  <Mounted>
    <Run>
      <View />
    </Run>
  </Mounted>
);

const ActivityPrototypePage = () => (
  <ProtoProvider>
    <Picker
      params={<ProtoParams />}
      variants={[
        { Component: of(Ribbon), name: "Лента" },
        { Component: of(Line), name: "Строка" },
        { Component: of(Panel), name: "Панель" },
      ]}
    />
  </ProtoProvider>
);

export default ActivityPrototypePage;
