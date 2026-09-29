"use client";

import { useEffect, useState } from "react";

import { Picker } from "../_shared/picker";
import { ProtoParams, ProtoProvider } from "./state";
import { Cards } from "./v-cards";
import { Flat } from "./v-flat";
import { Scroll } from "./v-scroll";
import { Tabbed } from "./v-tabs";

// P9 · «Аккаунт»: profile, personalization (with the appearance, and the region shown inside it to decide by sight)
// and data, in one place, under a header as on a source's page. Four ways to gather the same pieces: one long page
// with a rail of anchors, the same with no rail, tabs, cards that open in place. Nothing here reaches the server; «Параметры» set the states worth seeing.

/** Drawn in the browser only: the theme is known there, and the page's clocks are its own. */
const Mounted = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? children : null;
};

const AccountPrototypePage = () => (
  <ProtoProvider>
    <Picker
      params={<ProtoParams />}
      variants={[
        {
          Component: () => (
            <Mounted>
              <Scroll />
            </Mounted>
          ),
          name: "Лента",
        },
        {
          Component: () => (
            <Mounted>
              <Flat />
            </Mounted>
          ),
          name: "Сплошная",
        },
        {
          Component: () => (
            <Mounted>
              <Tabbed />
            </Mounted>
          ),
          name: "Вкладки",
        },
        {
          Component: () => (
            <Mounted>
              <Cards />
            </Mounted>
          ),
          name: "Карточки",
        },
      ]}
    />
  </ProtoProvider>
);

export default AccountPrototypePage;
