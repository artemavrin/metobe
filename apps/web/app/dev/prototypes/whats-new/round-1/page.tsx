"use client";

import { useEffect, useState } from "react";

import { Picker } from "../../_shared/picker";
import { ProtoParams, ProtoProvider } from "../state";
import { Contents } from "../v-contents";
import { Journal } from "../v-journal";
import { Tour } from "../v-tour";

// «Что нового», round 1: the window with screenshots — «Журнал», «Тур» (picked), «Оглавление». Round 2 at
// /dev/prototypes/whats-new keeps the tour and puts the product itself where the screenshots were.

const Mounted = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? children : null;
};

const WhatsNewRoundOnePage = () => (
  <ProtoProvider>
    <Picker
      params={<ProtoParams />}
      variants={[
        { Component: () => <Mounted><Journal /></Mounted>, name: "Журнал", pickerTop: true },
        { Component: () => <Mounted><Tour /></Mounted>, name: "Тур", pickerTop: true },
        { Component: () => <Mounted><Contents /></Mounted>, name: "Оглавление", pickerTop: true },
      ]}
    />
  </ProtoProvider>
);

export default WhatsNewRoundOnePage;
