"use client";

import { useEffect, useState } from "react";

import { Picker } from "../_shared/picker";
import { Card } from "./v-card";
import { DialogVariant } from "./v-dialog";
import { Timeline } from "./v-timeline";
import { ProtoParams, ProtoProvider } from "./state";

// D35 · «О системе»: Metobe updated from the app by the updater in compose. What the admin sees — the new version and
// its notes, «now» or «at night», the steps while it runs, how it ended, automatic fixes, the history with copies of
// the base — and what a person in the chat sees meanwhile. Three layouts: «Карточка» (everything in one card),
// «Лента» (the server's versions as a line), «Диалог» (a calm row that opens a window). «Параметры»: the state, how it
// ends, whose eyes.

const Mounted = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? children : null;
};

const UpdatesPrototypePage = () => (
  <ProtoProvider>
    <Picker
      params={<ProtoParams />}
      variants={[
        { Component: () => <Mounted><Card /></Mounted>, name: "Карточка" },
        { Component: () => <Mounted><Timeline /></Mounted>, name: "Лента" },
        { Component: () => <Mounted><DialogVariant /></Mounted>, name: "Диалог" },
      ]}
    />
  </ProtoProvider>
);

export default UpdatesPrototypePage;
