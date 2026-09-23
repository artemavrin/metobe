"use client";

import { ShellModes } from "../app-shell/shell-modes";
import { Picker } from "../_shared/picker";
import { SettingsModels } from "./settings-models";
import { SettingsPanel } from "./settings-panel";
import { ProvidersSettings } from "./settings-sections";

// P7: everyday provider and model settings, inside the chosen app shell («Режимы» → settings mode).
const ProvidersPrototypePage = () => (
  <Picker
    variants={[
      { Component: () => <ShellModes providers={<SettingsPanel embedded />} start="settings" />, name: "Панель" },
      { Component: () => <ShellModes providers={<ProvidersSettings />} start="settings" />, name: "Разделы" },
      { Component: () => <ShellModes providers={<SettingsModels embedded />} start="settings" />, name: "Модели" },
    ]}
  />
);

export default ProvidersPrototypePage;
