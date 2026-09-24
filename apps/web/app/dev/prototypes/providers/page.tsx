"use client";

import { ShellModes } from "../app-shell/shell-modes";
import { Picker } from "../_shared/picker";
import { PanelCompact } from "./panel/riff-compact";
import { Panel2 } from "./panel2";
import { PanelInspector } from "./panel/riff-inspector";
import { PanelTabs } from "./panel/riff-tabs";
import { WowBoard } from "./wow/board";
import { WowDeck } from "./wow/deck";
import { WowMap } from "./wow/map";
import { SettingsV3 } from "./v3";

// P7: everyday provider settings inside the chosen shell («Режимы» → settings).
// «Источники + провайдеры» (v3/) splits sources and model providers (D29) in a calm list → detail; the rest stay for comparison.
const ProvidersPrototypePage = () => (
  <Picker
    variants={[
      { Component: SettingsV3, name: "Погружение" },
      { Component: () => <ShellModes providers={<Panel2 />} start="settings" />, name: "Панель" },
      { Component: () => <ShellModes providers={<WowDeck />} start="settings" />, name: "Колода" },
      { Component: () => <ShellModes providers={<WowMap />} start="settings" />, name: "Схема" },
      { Component: () => <ShellModes providers={<WowBoard />} start="settings" />, name: "Доска" },
      { Component: () => <ShellModes providers={<PanelTabs />} start="settings" />, name: "Вкладки" },
      { Component: () => <ShellModes providers={<PanelInspector />} start="settings" />, name: "Инспектор" },
      { Component: () => <ShellModes providers={<PanelCompact />} start="settings" />, name: "Компакт" },
    ]}
  />
);

export default ProvidersPrototypePage;
