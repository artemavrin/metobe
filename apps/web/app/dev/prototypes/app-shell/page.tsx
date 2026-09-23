"use client";

import { Picker } from "../_shared/picker";
import { ShellClassic } from "./shell-classic";
import { ShellModes } from "./shell-modes";
import { ShellRail } from "./shell-rail";

// App shell: where chat, agents (v2) and every admin setting live. Chosen: «Режимы»; the others stay for comparison.
const AppShellPrototypePage = () => (
  <Picker
    variants={[
      { Component: ShellModes, name: "Режимы" },
      { Component: ShellClassic, name: "Классика" },
      { Component: ShellRail, name: "Две зоны" },
    ]}
  />
);

export default AppShellPrototypePage;
