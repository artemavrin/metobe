"use client";

import { useEffect, useState } from "react";

import { Picker } from "../_shared/picker";
import { ProtoParams, ProtoProvider } from "./state";
import { Card, Fold, Line } from "./variants";

// D37 · «Сжать чат»: the chat has grown heavy, the user is offered — never forced — to have a service model write
// its summary; from then on the model works from the summary and what follows it, the user keeps the whole chat.
// Three ways: «Строка» (a quiet line and a hairline), «Карточка» (a card that says why, in numbers), «Свёртка» (a chip
// over the composer, the history folds behind its summary). «Параметры» — the state, a question asked after.

/** Drawn in the browser only: the thread's times are counted from the clock. */
const Mounted = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? children : null;
};

const CompactPrototypePage = () => (
  <ProtoProvider>
    <Picker
      params={<ProtoParams />}
      variants={[
        { Component: () => <Mounted><Line /></Mounted>, name: "Строка", pickerTop: true },
        { Component: () => <Mounted><Card /></Mounted>, name: "Карточка", pickerTop: true },
        { Component: () => <Mounted><Fold /></Mounted>, name: "Свёртка", pickerTop: true },
      ]}
    />
  </ProtoProvider>
);

export default CompactPrototypePage;
