"use client";

import { Picker } from "../_shared/picker";
import { SettingsModels } from "./settings-models";
import { SettingsPanel } from "./settings-panel";
import { SettingsSections } from "./settings-sections";

// P7: everyday provider and model settings, three directions.
const ProvidersPrototypePage = () => (
  <Picker
    variants={[
      { Component: SettingsPanel, name: "Панель" },
      { Component: SettingsSections, name: "Разделы" },
      { Component: SettingsModels, name: "Модели" },
    ]}
  />
);

export default ProvidersPrototypePage;
