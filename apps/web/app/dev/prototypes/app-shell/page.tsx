"use client";

import { Picker } from "../_shared/picker";
import { SettingsV3 } from "../providers/v3";
import { ShellClassic } from "./shell-classic";
import { ShellRail } from "./shell-rail";

// App shell: where chat, agents (v2) and every admin setting live. Chosen: «Режимы» — with the real settings pages
// (providers/v3), so the shell and the admin are the same thing; the others stay for comparison.
const AppShellPrototypePage = () => (
  <Picker
    variants={[
      { Component: () => <SettingsV3 start="chat" />, name: "Режимы" },
      { Component: ShellClassic, name: "Классика" },
      { Component: ShellRail, name: "Две зоны" },
    ]}
  />
);

export default AppShellPrototypePage;
