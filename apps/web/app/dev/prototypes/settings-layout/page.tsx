"use client";

import type { ComponentType } from "react";

import { type SettingsCtx, ShellModes } from "../app-shell/shell-modes";
import { Picker } from "../_shared/picker";
import { LayoutCanvas, LayoutDrill, LayoutNested, LayoutSwitcher } from "../providers/v3/layouts";
import { MOTION_CSS } from "../providers/v3/motion";
import { type Settings, useSettings } from "../providers/v3/state";

// Where the list of a list → detail settings section (sources, providers, proxies) lives in the «Режимы» shell.
const withShell = (Layout: ComponentType<{ s: Settings; ctx: SettingsCtx }>) => {
  const Variant = () => {
    const s = useSettings();
    return (
      <>
        <style>{MOTION_CSS}</style>
        <ShellModes settings={(ctx) => <Layout ctx={ctx} s={s} />} start="settings" />
      </>
    );
  };
  return Variant;
};

const SettingsLayoutPrototypePage = () => (
  <Picker
    variants={[
      { Component: withShell(LayoutCanvas), name: "Холст" },
      { Component: withShell(LayoutNested), name: "Вложенное меню" },
      { Component: withShell(LayoutSwitcher), name: "Переключатель" },
      { Component: withShell(LayoutDrill), name: "Погружение" },
    ]}
  />
);

export default SettingsLayoutPrototypePage;
