"use client";

import { ShellModes } from "../app-shell/shell-modes";
import { Picker } from "../_shared/picker";
import { PanelCompact } from "./panel/riff-compact";
import { PanelInspector } from "./panel/riff-inspector";
import { PanelTabs } from "./panel/riff-tabs";

// P7: everyday provider settings inside the chosen shell («Режимы» → settings). Chosen direction: «Панель»;
// the variants riff on it. The earlier «Панель», «Разделы», «Модели» stay in settings-*.tsx for reference.
const ProvidersPrototypePage = () => (
  <Picker
    variants={[
      { Component: () => <ShellModes providers={<PanelTabs />} start="settings" />, name: "Вкладки" },
      { Component: () => <ShellModes providers={<PanelInspector />} start="settings" />, name: "Инспектор" },
      { Component: () => <ShellModes providers={<PanelCompact />} start="settings" />, name: "Компакт" },
    ]}
  />
);

export default ProvidersPrototypePage;
