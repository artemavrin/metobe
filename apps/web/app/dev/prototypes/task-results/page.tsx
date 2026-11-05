"use client";

import { useEffect, useState } from "react";

import { Picker } from "../_shared/picker";
import { ProtoProvider } from "../first-agent/state";
import { LastProvider, Log, Messages, OnlyNew, Params } from "./variants";

// P12 · итоги задачи: что приходит в чат задачи после запуска. Задача из /first-agent, «Цены конкурентов». Варианты —
// как выглядит запуск: «Сообщения», «Журнал», «Только новое». «Параметры»: телефон и чем кончился последний запуск —
// первый (сравнивать не с чем), изменения, нового нет, сбой. В адресе: `?v=1&last=quiet&sz=phone`.

const Mounted = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? children : null;
};

const TaskResultsPrototypePage = () => (
  <ProtoProvider>
    <LastProvider>
      <Picker
        params={<Params />}
        variants={[
          { Component: () => <Mounted><Messages /></Mounted>, name: "Сообщения", pickerTop: true },
          { Component: () => <Mounted><Log /></Mounted>, name: "Журнал", pickerTop: true },
          { Component: () => <Mounted><OnlyNew /></Mounted>, name: "Только новое", pickerTop: true },
        ]}
      />
    </LastProvider>
  </ProtoProvider>
);

export default TaskResultsPrototypePage;
