"use client";

import { useEffect, useState } from "react";

import { Picker } from "../_shared/picker";
import { InChat } from "./round3";
import { ProtoParams, ProtoProvider } from "./state";

// P11 · первая задача, раунд 3 (раунд 1 — /first-agent/round-1, раунд 2 — /first-agent/round-2). Всё в чате: композер
// подсвечивает понятые части задачи цветом, Hairline-конвейер (шаг ленты — запуск), недостающее модель спрашивает в
// том же чате, в конце — имя и свой цвет. «Параметры»: телефон, подключена ли почта.

/** Drawn in the browser only: the figure and the next runs are counted there. */
const Mounted = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? children : null;
};

const FirstAgentPrototypePage = () => (
  <ProtoProvider>
    <Picker params={<ProtoParams />} variants={[{ Component: () => <Mounted><InChat /></Mounted>, name: "В чате", pickerTop: true }]} />
  </ProtoProvider>
);

export default FirstAgentPrototypePage;
