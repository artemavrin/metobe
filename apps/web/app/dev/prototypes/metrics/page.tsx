"use client";

import { useEffect, useState } from "react";

import { Picker } from "../_shared/picker";
import { ChatFrame } from "./chat";
import { ProtoParams, ProtoProvider, useProto } from "./state";
import { Ledger } from "./v-ledger";
import { Strip } from "./v-strip";
import { Tiles } from "./v-tiles";

// P5b · «Показатели» (`metrics`): statistics in an answer — numbers, their change, history, progress to a goal,
// shares, spreads, rankings. What the three variants answer: how many numbers can one widget hold before it stops
// being read, and which chrome (a card each, one framed list, or none) keeps them scannable. Every number is a
// function of the rows of an earlier tool result (ARCH §9.2): the table the metrics are computed from is `data.ts`,
// and the tooltip of each label says how its number is made. «Параметры»: how many metrics, built / being built /
// failed, built live or opened from the history, desktop or phone; ↻ on the pill — the arrival again.

const Mounted = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? children : null;
};

const Screen = ({ View }: { View: (p: { scenario: import("./data").Scenario }) => React.ReactNode }) => {
  const { scenario } = useProto();
  return (
    <Mounted>
      <ChatFrame scenario={scenario} widget={<View scenario={scenario} />} />
    </Mounted>
  );
};

const MetricsPrototypePage = () => (
  <ProtoProvider>
    <Picker
      params={<ProtoParams />}
      variants={[
        { Component: () => <Screen View={Tiles} />, name: "Плитки" },
        { Component: () => <Screen View={Ledger} />, name: "Лента" },
        { Component: () => <Screen View={Strip} />, name: "Полоса" },
      ]}
    />
  </ProtoProvider>
);

export default MetricsPrototypePage;
