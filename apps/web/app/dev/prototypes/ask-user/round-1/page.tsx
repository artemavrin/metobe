"use client";

import { useEffect, useState } from "react";

import { Picker } from "../../_shared/picker";
import { ProtoParams, ProtoProvider, useProto } from "../state";
import { Card } from "../v-card";
import { Chips } from "../v-chips";
import { Dock } from "../v-dock";

// Round 1, not taken: a card in the answer on shadcn's Questionnaire, the same in the composer's place, buttons under
// the line. «Ни один» — the next round follows Claude's own AskUserQuestion.

const Keyed = ({ Variant }: { Variant: () => React.ReactNode }) => {
  const { scenario } = useProto();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <Variant key={scenario.id} /> : null;
};

const AskUserRound1Page = () => (
  <ProtoProvider>
    <Picker
      params={<ProtoParams />}
      variants={[
        { Component: () => <Keyed Variant={Card} />, name: "Карточка", pickerTop: true },
        { Component: () => <Keyed Variant={Dock} />, name: "Вместо поля ввода", pickerTop: true },
        { Component: () => <Keyed Variant={Chips} />, name: "Кнопки", pickerTop: true },
      ]}
    />
  </ProtoProvider>
);

export default AskUserRound1Page;
