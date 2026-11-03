"use client";

import { useEffect, useState } from "react";

import { Picker } from "../_shared/picker";
import { ProtoParams, ProtoProvider } from "./state";
import { Chats, Digest, Pages } from "./v3-views";

// P13 · «Агенты», раунд 3. Раунд 1 (/agents/round-1) — доска диспетчера; раунд 2 (/agents/round-2) — «Беседа» и
// «Журнал» вышли одним решением. Здесь три разных с первого экрана: «Беседа» (агенты как чаты, агент — его беседа),
// «Страница» (агент держит одну страницу «что сейчас», изменения помечены, есть версии), «Сводка» (свежие итоги всех
// на одной странице). Приёмы из Orbit: «Ждут вас» — пока есть что решить, уведомление с кнопкой, состояние словом и
// полоска шага, цифры моноширинным, подсказка в поле и примеры под ним. «Параметры»: агентов ещё нет, телефон.

const Mounted = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? children : null;
};

const AgentsPrototypePage = () => (
  <ProtoProvider>
    <Picker
      params={<ProtoParams />}
      variants={[
        { Component: () => <Mounted><Chats /></Mounted>, name: "Беседа" },
        { Component: () => <Mounted><Pages /></Mounted>, name: "Страница" },
        { Component: () => <Mounted><Digest /></Mounted>, name: "Сводка" },
      ]}
    />
  </ProtoProvider>
);

export default AgentsPrototypePage;
