"use client";

import { useEffect, useState } from "react";

import { Picker } from "../../_shared/picker";
import { ProtoParams, ProtoProvider } from "../state";
import { Agenda, Cards, Queue } from "../views";

// P13, round 1: the agents as a dispatcher's board — cards, a queue by state, a day by hours; a run as a chat, a
// trace or a sheet (ReUI solutions/agents). None was picked: too much of an operator's console for one person's agents.

const Mounted = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? children : null;
};

const AgentsRoundOnePage = () => (
  <ProtoProvider>
    <Picker
      params={<ProtoParams />}
      variants={[
        { Component: () => <Mounted><Cards /></Mounted>, name: "Карточки" },
        { Component: () => <Mounted><Queue /></Mounted>, name: "Очередь" },
        { Component: () => <Mounted><Agenda /></Mounted>, name: "Расписание" },
      ]}
    />
  </ProtoProvider>
);

export default AgentsRoundOnePage;
