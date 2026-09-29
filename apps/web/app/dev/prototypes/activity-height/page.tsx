"use client";

import { useEffect, useState } from "react";

import { Picker } from "../_shared/picker";
import { RunProvider } from "../activity/run";
import { ProtoParams, ProtoProvider, useProto } from "../activity/state";
import { EachRibbon } from "./v-each";
import { LineRibbon } from "./v-line";
import { StageRibbon } from "./v-stage";
import { WindowRibbon } from "./v-window";

// P4b · «Высота ленты»: чем ограничить высоту ленты шагов, чтобы длинные вызовы не растягивали ответ и страница не
// прыгала. Четыре устройства одного и того же хода работы (сценарии и проигрыватель — из «Активности ответа»):
// всё в одном окне с прокруткой; каждый шаг ограничен сам; одна строка на шаг, а содержимое поверх; полоса значков и
// сцена фиксированной высоты. «Параметры»: сценарий («Тяжёлый» — как в жизни: шесть вызовов с длинным входом), экран,
// скорость; ↻ на пилюле — ответ заново.

const Mounted = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? children : null;
};

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

const ActivityHeightPage = () => (
  <ProtoProvider initialScenario="heavy">
    <Picker
      params={<ProtoParams />}
      variants={[
        { Component: of(WindowRibbon), name: "Одно окно" },
        { Component: of(EachRibbon), name: "Каждый шаг" },
        { Component: of(LineRibbon), name: "Одна строка" },
        { Component: of(StageRibbon), name: "Полоса и сцена" },
      ]}
    />
  </ProtoProvider>
);

export default ActivityHeightPage;
