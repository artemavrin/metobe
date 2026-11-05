"use client";

import { useEffect, useState } from "react";

import { Picker } from "../_shared/picker";
import { ProtoProvider } from "../first-agent/state";
import { Feed, Log, Params, TaskProvider } from "./variants";

// P12 · итоги задачи, раунд 2: что приходит в чат задачи после запусков. Свежий запуск сверху, история ниже. Три задачи
// с разными итогами — таблица цен, список писем, сводка продаж с виджетом показателей — переключаются в боковой панели:
// итог — это обычный ответ модели. Варианты — «Лента» и «Журнал». «Параметры»: телефон и задача.
// В адресе: `?v=1&task=sales&sz=phone`.

const Mounted = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? children : null;
};

const TaskResultsPrototypePage = () => (
  <ProtoProvider>
    <TaskProvider>
      <Picker
        params={<Params />}
        variants={[
          { Component: () => <Mounted><Feed /></Mounted>, name: "Лента", pickerTop: true },
          { Component: () => <Mounted><Log /></Mounted>, name: "Журнал", pickerTop: true },
        ]}
      />
    </TaskProvider>
  </ProtoProvider>
);

export default TaskResultsPrototypePage;
