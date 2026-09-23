"use client";

import { Picker } from "../_shared/picker";
import { ShellClassic } from "./shell-classic";
import { ShellModes } from "./shell-modes";
import { ShellRail } from "./shell-rail";

// App shell: where chat, agents (v2) and every admin setting live. Three directions.
const AppShellPrototypePage = () => (
  <Picker
    variants={[
      { Component: ShellClassic, name: "Классика" },
      { Component: ShellRail, name: "Две зоны" },
      { Component: ShellModes, name: "Режимы" },
    ]}
  />
);

export default AppShellPrototypePage;
