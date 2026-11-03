"use client";

import { useEffect, useState } from "react";

import { Picker } from "../_shared/picker";
import { ProtoParams, ProtoProvider } from "../agents/state";
import { Decisions, Feed, InboxProvider, Mail } from "./views";

// P12 · «Входящие агентов» (§16.4): сводки, вопросы, сбои и подтверждения в одном месте. Три хода: «Лента» (как
// написано: по дням, фильтры, кнопки в ленте, клавиши), «Почта» (список и пункт целиком рядом — ReUI «Approval
// Inbox») и «Сначала решения» (что ждёт вас — сверху развёрнутым, сводки — по строке на агента). Агенты и запуски те
// же, что в P13; «Открыть запуск» ведёт туда. «Параметры»: пусто, телефон.

const Mounted = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? children : null;
};

const InboxPrototypePage = () => (
  <ProtoProvider>
    <InboxProvider>
      <Picker
        params={<ProtoParams />}
        variants={[
          { Component: () => <Mounted><Feed /></Mounted>, name: "Лента" },
          { Component: () => <Mounted><Mail /></Mounted>, name: "Почта" },
          { Component: () => <Mounted><Decisions /></Mounted>, name: "Сначала решения" },
        ]}
      />
    </InboxProvider>
  </ProtoProvider>
);

export default InboxPrototypePage;
