"use client";

import { useEffect, useState } from "react";

import { Picker } from "../_shared/picker";
import { ProtoParams, ProtoProvider } from "./state";
import { Overview } from "./v-overview";
import { Pivot } from "./v-pivot";
import { Report } from "./v-report";
import { Vercel } from "./v-vercel";

// P10 · «Расходы» (round 2: «Vercel», by the AI Gateway's Usage and Requests — four cards and a table): the usage page grown from one table of models into models, people and days with charts — an
// admin's whole team, or one person's own. Three ways to lay it out: «Обзор» (numbers as tiles, the days stacked by
// models or people, two rankings), «Сводка» (numbers in a line, the total over the month before, the «кто на чём»
// table, a calendar), «Отчёт» (one big number, one list at a time, rows open in place). Two currencies are never
// added: «Деньги» shows each, a chart one at a time. «Параметры»: whose, currencies, empty month, phone.

const Mounted = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? children : null;
};

const UsagePrototypePage = () => (
  <ProtoProvider>
    <Picker
      params={<ProtoParams />}
      variants={[
        { Component: () => <Mounted><Vercel /></Mounted>, name: "Vercel" },
        { Component: () => <Mounted><Overview /></Mounted>, name: "Обзор" },
        { Component: () => <Mounted><Pivot /></Mounted>, name: "Сводка" },
        { Component: () => <Mounted><Report /></Mounted>, name: "Отчёт" },
      ]}
    />
  </ProtoProvider>
);

export default UsagePrototypePage;
