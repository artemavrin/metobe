"use client";

import { useEffect, useState } from "react";

import { Picker } from "../_shared/picker";
import { ProtoProvider } from "../first-agent/state";
import { Attention, Cards, CountProvider, Lines, Params } from "./variants";

// P13 · список задач: страница «Задачи». Без задач — экран «Что поручить?» из P11. С задачами — «Строки», «Карточки»
// или «По вниманию»; внизу поле для новой задачи. Первые три задачи открываются на своей странице (/task-edit).
// «Параметры»: телефон и сколько задач — нет, 3, 7. В адресе: `?v=1&n=3&sz=phone`.

const Mounted = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? children : null;
};

const TasksListPrototypePage = () => (
  <ProtoProvider>
    <CountProvider>
      <Picker
        params={<Params />}
        variants={[
          { Component: () => <Mounted><Lines /></Mounted>, name: "Строки", pickerTop: true },
          { Component: () => <Mounted><Cards /></Mounted>, name: "Карточки", pickerTop: true },
          { Component: () => <Mounted><Attention /></Mounted>, name: "По вниманию", pickerTop: true },
        ]}
      />
    </CountProvider>
  </ProtoProvider>
);

export default TasksListPrototypePage;
