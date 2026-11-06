"use client";

import { useEffect, useState } from "react";

import { Picker } from "../_shared/picker";
import { ProtoProvider } from "../first-agent/state";
import { Params, TaskProvider } from "../task-results/variants";
import { Card, Panel, Top } from "./variants";

// P15 · изменение задачи словами (D28): модель предлагает «было → стало», применяет человек. Страница задачи —
// «Последний итог» (/task-results), в поле внизу уже написана просьба — Enter. Варианты — где появляется предложение:
// «Сверху», «Панель», «Карточка задачи». «Параметры»: телефон и задача (у каждой своя просьба).
// В адресе: `?v=1&task=mail&sz=phone`.

const Mounted = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? children : null;
};

const TaskEditPrototypePage = () => (
  <ProtoProvider>
    <TaskProvider>
      <Picker
        params={<Params />}
        variants={[
          { Component: () => <Mounted><Top /></Mounted>, name: "Сверху", pickerTop: true },
          { Component: () => <Mounted><Panel /></Mounted>, name: "Панель", pickerTop: true },
          { Component: () => <Mounted><Card /></Mounted>, name: "Карточка задачи", pickerTop: true },
        ]}
      />
    </TaskProvider>
  </ProtoProvider>
);

export default TaskEditPrototypePage;
