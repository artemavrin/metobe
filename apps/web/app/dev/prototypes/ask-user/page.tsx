"use client";

import { useEffect, useState } from "react";

import { Picker } from "../_shared/picker";
import { ProtoParams, ProtoProvider, useProto } from "./state";
import { Claude } from "./v-claude";

// «Модель спрашивает»: the answer needs what only the user knows — a period, whom to write to — and the model stops
// to ask instead of guessing. Round 2 follows Claude's AskUserQuestion; round 1 (a card, the composer's place,
// buttons) is at /dev/prototypes/ask-user/round-1. «Параметры» — how much it asks.

/**
 * A variant anew whenever the knob changes: the card starts from «asking». Drawn in the browser only — the thread's
 * «минуту назад» is counted from the clock, which the server's render would not match.
 */
const Keyed = ({ Variant }: { Variant: () => React.ReactNode }) => {
  const { scenario } = useProto();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <Variant key={scenario.id} /> : null;
};

const AskUserPrototypePage = () => (
  <ProtoProvider>
    <Picker
      params={<ProtoParams />}
      variants={[
        { Component: () => <Keyed Variant={Claude} />, name: "Как у Claude", pickerTop: true },
      ]}
    />
  </ProtoProvider>
);

export default AskUserPrototypePage;
