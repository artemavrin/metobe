"use client";

import { useEffect, useState } from "react";

import { Picker } from "../../_shared/picker";
import { ProtoParams, ProtoProvider } from "../state";
import { Log, Summary, Talk } from "../v2-views";

// P13 · «Агенты», раунд 2 (раунд 1 — /agents/round-1: доска диспетчера, не подошла). «Беседа» и «Журнал» вышли
// одной идеей в двух плотностях, список у них общий — в раунде 3 «Журнал» сменила «Страница». Агент — беседа, которая
// просыпается по расписанию, а его настройки — одна фраза: «По будням в 9:00 смотрит почту и Битрикс24 … и присылает
// во входящие и push»; выделенное меняется нажатием, задание — словами в беседе. Три способа читать итоги:
// «Беседа», «Журнал», «Сводка». «Параметры»: агентов ещё нет, телефон.

const Mounted = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? children : null;
};

const AgentsRoundTwoPage = () => (
  <ProtoProvider>
    <Picker
      params={<ProtoParams />}
      variants={[
        { Component: () => <Mounted><Talk /></Mounted>, name: "Беседа" },
        { Component: () => <Mounted><Log /></Mounted>, name: "Журнал" },
        { Component: () => <Mounted><Summary /></Mounted>, name: "Сводка" },
      ]}
    />
  </ProtoProvider>
);

export default AgentsRoundTwoPage;
