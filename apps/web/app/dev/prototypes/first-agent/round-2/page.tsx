"use client";

import { useEffect, useState } from "react";

import { Picker } from "../../_shared/picker";
import { ProtoParams, ProtoProvider } from "../state";
import { DoFirst, Employee, Note } from "../round2";

// P11 · первый агент, раунд 2 (раунд 1 — /first-agent/round-1, отвергнут целиком). Три разных хода: «Сначала
// сделать» (обычный чат, агентом становится разговор с готовым итогом), «Сотрудник» (страница с именем, инструкциями
// и явными доступами), «Записка» (одна записка, понятое подсвечивается при наборе). «Параметры»: телефон, почта.

/** Drawn in the browser only: the next runs are counted from the clock of the prototype. */
const Mounted = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? children : null;
};

const FirstAgentRound2Page = () => (
  <ProtoProvider>
    <Picker
      params={<ProtoParams />}
      variants={[
        { Component: () => <Mounted><DoFirst /></Mounted>, name: "Сначала сделать", pickerTop: true },
        { Component: () => <Mounted><Employee /></Mounted>, name: "Сотрудник", pickerTop: true },
        { Component: () => <Mounted><Note /></Mounted>, name: "Записка" },
      ]}
    />
  </ProtoProvider>
);

export default FirstAgentRound2Page;
