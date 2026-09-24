"use client";

import { ShellModes } from "../app-shell/shell-modes";
import { Picker } from "../_shared/picker";
import { PanelCompact } from "./panel/riff-compact";
import { PanelInspector } from "./panel/riff-inspector";
import { PanelTabs } from "./panel/riff-tabs";
import { WowBoard } from "./wow/board";
import { WowDeck } from "./wow/deck";
import { WowMap } from "./wow/map";

// P7: everyday provider settings inside the chosen shell («Режимы» → settings).
// «Колода», «Схема», «Доска» chase the onboarding's wow; the «Панель» riffs stay for comparison.
const ProvidersPrototypePage = () => (
  <Picker
    variants={[
      { Component: () => <ShellModes providers={<WowDeck />} start="settings" />, name: "Колода" },
      { Component: () => <ShellModes providers={<WowMap />} start="settings" />, name: "Схема" },
      { Component: () => <ShellModes providers={<WowBoard />} start="settings" />, name: "Доска" },
      { Component: () => <ShellModes providers={<PanelTabs />} start="settings" />, name: "Панель · вкладки" },
      { Component: () => <ShellModes providers={<PanelInspector />} start="settings" />, name: "Панель · инспектор" },
      { Component: () => <ShellModes providers={<PanelCompact />} start="settings" />, name: "Панель · компакт" },
    ]}
  />
);

export default ProvidersPrototypePage;
