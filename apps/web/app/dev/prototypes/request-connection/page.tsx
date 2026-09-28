"use client";

import { useEffect, useState } from "react";

import { Picker } from "../_shared/picker";
import { ProtoParams, ProtoProvider, useProto } from "./state";
import { Dock } from "./v-dock";
import { Inline } from "./v-inline";
import { Strip } from "./v-strip";

// P8 · «Подключите X, чтобы продолжить»: the model needs a per-user MCP server the user has no account on, asks in
// the chat, and the answer carries on by itself once connected. Where the ask lives: in the answer, as a line with
// the form in a dialog, or over the composer. «Параметры» — the way of signing in and what the server says.

/**
 * A variant anew whenever the knobs change: the card starts from «waiting». Drawn in the browser only — the thread's
 * «минуту назад» is counted from the clock, which the server's render would not match.
 */
const Keyed = ({ Variant }: { Variant: () => React.ReactNode }) => {
  const { scenario, outcome } = useProto();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <Variant key={`${scenario.server.id}-${outcome}`} /> : null;
};

const RequestConnectionPrototypePage = () => (
  <ProtoProvider>
    <Picker
      params={<ProtoParams />}
      variants={[
        { Component: () => <Keyed Variant={Inline} />, name: "В ленте" },
        { Component: () => <Keyed Variant={Strip} />, name: "Плашка" },
        { Component: () => <Keyed Variant={Dock} />, name: "У композера", pickerTop: true },
      ]}
    />
  </ProtoProvider>
);

export default RequestConnectionPrototypePage;
