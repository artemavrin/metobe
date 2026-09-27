"use client";

import { Picker } from "../_shared/picker";
import { ProtoParams, ProtoProvider } from "./state";
import { Drill } from "./v-drill";
import { Feed } from "./v-feed";
import { Hub } from "./v-hub";

// P8 · «Мои подключения» and the user's own settings around them: how a user sees and changes their credentials to the
// MCP servers with personal accounts. Chosen: «Погружение» — a list section with a page per server; «· 2» moves leaving
// into its own section (as removing anything in the settings) and signs in with OAuth in the provider's window under a
// modal. Round 1 kept: «Лента» — one screen by state; «Аккаунт» — a profile hub with tabs, cards and a dialog.
const MyConnectionsPrototypePage = () => (
  <ProtoProvider>
    <Picker
      params={<ProtoParams />}
      variants={[
        { Component: () => <Drill v2 />, name: "Погружение · 2" },
        { Component: Drill, name: "Погружение" },
        { Component: Feed, name: "Лента" },
        { Component: Hub, name: "Аккаунт" },
      ]}
    />
  </ProtoProvider>
);

export default MyConnectionsPrototypePage;
