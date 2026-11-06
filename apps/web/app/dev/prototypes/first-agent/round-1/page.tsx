"use client";

import { useEffect, useState } from "react";

import { Picker } from "../../_shared/picker";
import { ProtoParams, ProtoProvider } from "../state";
import { Inline, Sentence, Talk } from "../variants";

// P11 · первый агент — начало агентов заново, по одному шагу (раунды 1–3 /agents отложены как перегруженные).
// Агентов ещё нет: человек пишет поручение словами, видит черновик и создаёт агента. Три ответа на «как поручение
// становится агентом»: «Разговор» (черновик карточкой в чате, правки словами), «На месте» (черновик-форма под полем),
// «Фраза» (черновик — одно предложение с нажимаемыми частями). «Параметры»: телефон, подключена ли почта.

/** Drawn in the browser only: the next runs are counted from the clock of the prototype. */
const Mounted = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? children : null;
};

const FirstAgentRound1Page = () => (
  <ProtoProvider>
    <Picker
      params={<ProtoParams />}
      variants={[
        { Component: () => <Mounted><Talk /></Mounted>, name: "Разговор", pickerTop: true },
        { Component: () => <Mounted><Inline /></Mounted>, name: "На месте" },
        { Component: () => <Mounted><Sentence /></Mounted>, name: "Фраза" },
      ]}
    />
  </ProtoProvider>
);

export default FirstAgentRound1Page;
